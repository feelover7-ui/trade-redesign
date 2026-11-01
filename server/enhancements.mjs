import multer from 'multer';
import {z} from 'zod';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {uid,now,must,audit,transaction} from './db.mjs';
import {hash} from './auth.mjs';
import * as svc from './service.mjs';
import {normalizeUploadName} from './file-names.mjs';
import {IMPORT_FIELDS,parseWorkbookIsolated} from './excel-parser.mjs';
import {storeImport,loadImport,previewImport,confirmImport} from './excel-import.mjs';
import {providerStatus,searchCatalog,identifyProduct,geocodeAddress,drivingRoute} from './providers.mjs';
import {shipmentSchema,coordinateSchema,estimateShipment,DEFAULT_RATE_CARD,rateCardSchema} from './shipping.mjs';
import {referenceImage} from './reference-image.mjs';

export const photoLabelSchema=z.object({productName:z.string().trim().max(100).default(''),purpose:z.enum(['OVERVIEW','NAMEPLATE','DEFECT','COMPONENT']).default('OVERVIEW')});
export function savePhotoLabel(db,user,fileId,input){const d=photoLabelSchema.parse(input);db.prepare('INSERT INTO photo_metadata VALUES(?,?,?,?,?) ON CONFLICT(file_id) DO UPDATE SET product_name=excluded.product_name,purpose=excluded.purpose,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run(fileId,d.productName,d.purpose,user.id,now());}
export function productFingerprint(db,lotId){const row=svc.lotRow(db,lotId);const photos=db.prepare("SELECT f.id,f.sha256,m.product_name,m.purpose FROM files f LEFT JOIN photo_metadata m ON m.file_id=f.id WHERE f.lot_id=? AND f.kind='PHOTO' ORDER BY f.id").all(lotId);return hash(JSON.stringify({version:row.version,data:row.data,photos}));}
export function applySuggestion(db,user,id,input){const d=z.object({fields:z.array(z.enum(['title','manufacturer','model','description','category','actualIdentificationCode'])).min(1).max(6),version:z.number().int()}).parse(input);return transaction(db,()=>{
 const s=db.prepare('SELECT * FROM product_suggestions WHERE id=? AND org_id=?').get(id,user.org_id);must(s,'제안을 찾을 수 없습니다.',404);const row=svc.ownLot(db,user,s.lot_id);must(s.state==='PROPOSED'&&row.state==='DRAFT','초안에 아직 적용하지 않은 제안만 반영합니다.',409);must(row.version===d.version&&row.version===s.lot_version&&productFingerprint(db,row.id)===s.input_hash,'사진/초안이 바뀌었습니다. 최신 자료로 다시 분석하세요.',409,'STALE_SUGGESTION');
 const proposal=JSON.parse(s.payload),draft=JSON.parse(row.data);for(const key of d.fields){must(typeof proposal[key]==='string'&&proposal[key].length>0,'비어 있는 제안 항목은 반영할 수 없습니다.');draft[key]=proposal[key];}
 svc.saveLot(db,user,{...draft,version:row.version},row.id);db.prepare("UPDATE product_suggestions SET state='APPLIED',applied_at=? WHERE id=?").run(now(),id);audit(db,user,'PRODUCT_SUGGESTION_APPLY',row.id,{suggestionId:id,fields:d.fields,source:s.source,officialFieldsUnchanged:true});return {id:row.id};
});}
export function mountEnhancements(app,db,{dataDir,env=process.env,fetcher=fetch}={}){
 const external={env,fetcher},active=new Set(),routes=new Map();let parsing=0;
 const rate=env.SHIPPING_RATE_CARD_JSON?rateCardSchema.parse(JSON.parse(env.SHIPPING_RATE_CARD_JSON)):DEFAULT_RATE_CARD;
 const guard=(user,kind,limit=60)=>{svc.business(user);const since=new Date(Date.now()-3600000).toISOString();const n=db.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE actor_id=? AND action=? AND created_at>?').get(user.id,kind,since).n;must(n<limit,'이 기능의 시간당 호출 한도를 넘었습니다.',429);audit(db,user,kind,user.id);};
 app.get('/api/assistant/status',(req,res)=>{res.json({...providerStatus(env),shipping:{rateVersion:rate.version,sample:rate.sample},excel:{extensions:['xlsx','xls'],maxRows:2000,maxBytes:8388608}});});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:0}});
 app.post('/api/imports/excel',upload.single('file'),async(req,res)=>{
  svc.business(req.user);must(req.file,'엑셀 파일을 선택하세요.');const name=normalizeUploadName(req.file.originalname);must(/\.(xlsx|xls)$/i.test(name),'XLSX 또는 XLS 파일만 지원합니다.');must(parsing<2,'다른 엑셀을 분석 중입니다. 잠시 후 다시 시도하세요.',429);guard(req.user,'EXCEL_PARSE_REQUEST',20);parsing++;
  try{const workbook=await parseWorkbookIsolated(req.file.buffer);const id=storeImport(db,req.user,name,req.file.buffer,workbook);res.json({id,name,fields:IMPORT_FIELDS.map(([key,label])=>({key,label})),sheets:workbook.sheets.map(s=>({...s,rows:s.rows.slice(0,35),rowCount:s.rows.length}))});}catch(e){if(!e.status)e.status=400;throw e;}finally{parsing--;}
 });
 app.post('/api/imports/:id/preview',(req,res)=>{const b=loadImport(db,req.user,req.params.id),p=previewImport(b,req.body);res.json({...p,rowCount:p.rows.length,rows:p.rows.slice(0,20).map(({raw,...r})=>r),groups:undefined});});
 app.post('/api/imports/:id/confirm',(req,res)=>res.json(confirmImport(db,req.user,req.params.id,req.body)));
 app.patch('/api/files/:id/label',(req,res)=>transaction(db,()=>{
  const f=db.prepare("SELECT * FROM files WHERE id=? AND kind='PHOTO' AND org_id=?").get(req.params.id,req.user.org_id);must(f&&f.lot_id,'본 기관의 물품사진만 수정할 수 있습니다.',404);const lot=svc.ownLot(db,req.user,f.lot_id);must(lot.state==='DRAFT','사진 품명은 초안에서만 수정합니다.',409);savePhotoLabel(db,req.user,f.id,req.body);db.prepare('UPDATE lots SET version=version+1,updated_at=? WHERE id=?').run(now(),lot.id);audit(db,req.user,'LOT_EDIT',lot.id,{photoId:f.id,metadataOnly:true});res.json({ok:true});
 }));
 app.get('/api/lots/:id/suggestions',(req,res)=>{svc.ownLot(db,req.user,req.params.id);res.json(db.prepare('SELECT id,source,model,state,created_at,lot_version,payload FROM product_suggestions WHERE lot_id=? ORDER BY created_at DESC LIMIT 20').all(req.params.id).map(s=>({...s,proposal:JSON.parse(s.payload),payload:undefined})));});
 app.post('/api/lots/:id/enrich',async(req,res)=>{
  const row=svc.ownLot(db,req.user,req.params.id);must(row.state==='DRAFT','비공개 초안을 먼저 저장하세요.',409);
  const d=z.object({mode:z.enum(['AUTO','CATALOG','AI']),name:z.string().trim().max(100).default(''),identificationCode:z.string().regex(/^$|^\d{8}$/).default(''),photoIds:z.array(z.string().uuid()).max(3).default([]),consent:z.boolean().default(false)}).parse(req.body);
  const status=providerStatus(env);if(d.mode==='AI'){must(status.ai.configured,'AI가 미연결입니다. 연결·설정에서 상태를 확인하세요.',503,'NOT_CONNECTED');must(d.consent,'선택한 사진과 품명을 외부 AI로 전송하는 데 동의해야 합니다.');}
  must(!active.has(req.user.id),'이 계정의 분석이 진행 중입니다.',429);guard(req.user,'ENRICH_REQUEST',30);active.add(req.user.id);const fingerprint=productFingerprint(db,row.id);let candidates=[],source='PROCUREMENT';const notes=[];
  try{
   if(d.mode!=='AI'){
    if(status.procurement.configured){try{
     candidates=await searchCatalog({identificationCode:d.identificationCode,name:d.name},external);
     if(!candidates.length&&d.identificationCode&&d.name.length>=2)candidates=await searchCatalog({name:d.name},external);
     if(!candidates.length)notes.push('조달청 검색 결과가 없습니다. 명판 사진 AI 분석 또는 직접 입력을 사용하세요.');
    }catch(e){notes.push(e.message);if(d.mode==='CATALOG')throw e;}}
    else notes.push('조달청 API 미연결: 물품식별번호 조회를 실행하지 않았습니다.');
   }
   if(d.mode==='AI'||(!candidates.length&&d.mode==='AUTO'&&status.ai.configured&&d.consent)){
    must(d.consent,'사진의 개인정보를 제거하고 외부 AI 전송에 동의하세요.');must(d.photoIds.length,'분석할 사진을 1~3장 선택하세요.');
    const day=new Date().toISOString().slice(0,10);const count=db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE actor_id=? AND action='AI_ANALYZE_REQUEST' AND created_at>=?").get(req.user.id,day).n;const max=Math.min(200,Math.max(1,Number(env.AI_DAILY_LIMIT)||20));must(count<max,'일일 AI 분석 한도를 넘었습니다.',429);
    const photos=[];for(const id of d.photoIds){const f=db.prepare("SELECT f.*,m.product_name,m.purpose FROM files f LEFT JOIN photo_metadata m ON m.file_id=f.id WHERE f.id=? AND f.lot_id=? AND f.org_id=? AND f.kind='PHOTO'").get(id,row.id,req.user.org_id);must(f,'선택한 사진은 해당 초안의 현물사진이어야 합니다.',403);const bytes=await sharp(readFileSync(join(dataDir,'uploads',f.disk_name)),{limitInputPixels:24000000}).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();photos.push({bytes,label:`${f.product_name||d.name} / ${f.purpose||'OVERVIEW'}`});}
    audit(db,req.user,'AI_ANALYZE_REQUEST',row.id,{photoIds:d.photoIds,model:env.AI_MODEL,consent:true});
    candidates=[await identifyProduct({name:d.name,photos},external)];source='AI';
   }else if(!candidates.length&&d.mode==='AUTO')notes.push('AI 자동 보완은 모델 설정·사진 선택·전송 동의가 있을 때만 실행합니다.');
   const current=svc.ownLot(db,req.user,row.id);must(current.state==='DRAFT'&&productFingerprint(db,row.id)===fingerprint,'분석 중 초안/사진이 바뀌었습니다. 결과를 적용하지 않았습니다.',409);
   const saved=transaction(db,()=>candidates.map(proposal=>{const id=uid();db.prepare('INSERT INTO product_suggestions VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)').run(id,req.user.org_id,row.id,req.user.id,source,source==='AI'?env.AI_MODEL:'',row.version,fingerprint,JSON.stringify(proposal),'PROPOSED',now());return {id,source,proposal};}));
   res.json({suggestions:saved,notes,connected:status});
  }finally{active.delete(req.user.id);}
 });
 app.post('/api/suggestions/:id/apply',(req,res)=>res.json(applySuggestion(db,req.user,req.params.id,req.body)));
 app.get('/api/suggestions/:id/image',async(req,res)=>{svc.business(req.user);const s=db.prepare('SELECT * FROM product_suggestions WHERE id=? AND org_id=?').get(req.params.id,req.user.org_id);must(s,'참고사진을 찾을 수 없습니다.',404);svc.ownLot(db,req.user,s.lot_id);must(env.PROCUREMENT_IMAGE_RIGHTS_CONFIRMED==='true','참고사진 이용조건 확인 전 자동 표시는 꺼져 있습니다.',403);guard(req.user,'REFERENCE_IMAGE_REQUEST',60);try{res.type('image/webp').send(await referenceImage(JSON.parse(s.payload).imageUrl));}catch{res.status(502).json({error:'참고사진을 안전하게 가져오지 못했습니다. 현물사진을 사용하세요.'});}});
 app.post('/api/shipping/geocode',async(req,res)=>{guard(req.user,'GEOCODE_REQUEST',60);must(req.body.consent===true,'입력 주소를 주소검색 서비스로 전송하는 데 동의하세요.');res.json({candidates:await geocodeAddress(req.body.query,external)});});
 app.post('/api/shipping/route',async(req,res)=>{guard(req.user,'ROUTE_REQUEST',40);const d=z.object({origin:coordinateSchema,destination:coordinateSchema,consent:z.literal(true)}).parse(req.body);const route=await drivingRoute(d.origin,d.destination,external);for(const [id,r]of routes)if(r.expires<Date.now())routes.delete(id);must(routes.size<1000,'경로 임시저장 한도입니다.',429);const id=uid();routes.set(id,{...route,origin:d.origin,destination:d.destination,userId:req.user.id,expires:Date.now()+20*60000});res.json({id,...route});});
 app.post('/api/shipping/estimate',(req,res)=>{svc.business(req.user);const d=shipmentSchema.parse(req.body);if(d.lotId)svc.getLot(db,req.user,d.lotId);let route=null;if(d.distanceMode==='ROAD'){route=routes.get(d.routeId);must(route&&route.userId===req.user.id&&route.expires>Date.now()&&JSON.stringify(route.origin)===JSON.stringify(d.origin)&&JSON.stringify(route.destination)===JSON.stringify(d.destination),'확인한 경로가 만료되었거나 위치가 변경되었습니다. 경로를 다시 조회하세요.',409);}const result=estimateShipment(d,route,rate);let id=null;if(d.persist){id=uid();db.prepare('INSERT INTO shipping_quotes VALUES(?,?,?,?,?,?,?)').run(id,req.user.org_id,req.user.id,d.lotId||null,JSON.stringify(d),JSON.stringify(result),now());audit(db,req.user,'SHIPPING_ESTIMATE_SAVED',id,{binding:false,rateVersion:rate.version});}res.json({id,...result});});
 app.get('/api/shipping/quotes',(req,res)=>{svc.business(req.user);res.json(db.prepare('SELECT id,input,result,created_at FROM shipping_quotes WHERE org_id=? AND created_by=? ORDER BY created_at DESC LIMIT 20').all(req.user.org_id,req.user.id).map(r=>({...r,input:JSON.parse(r.input),result:JSON.parse(r.result)})));});
}
