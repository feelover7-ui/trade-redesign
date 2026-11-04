import {convertNativeOzdIsolated} from './ozd/worker.mjs';
import {PARSER_VERSION} from './ozd/native.mjs';
import {extname} from 'node:path';
import multer from 'multer';
import {uid,now,must,audit,transaction} from './db.mjs';
import {business} from './service.mjs';
import {normalizeUploadName} from './file-names.mjs';
import {parseWorkbookIsolated} from './excel-parser.mjs';
import {storeImport,loadImport} from './excel-import.mjs';
import {saveImportImages,uploadView} from './inventory-tools.mjs';
import {assertOzd,convertOzd,ozdStatus,XLSX_MIME,sha256,MAX_DOCUMENT_BYTES} from './ozd-converter.mjs';

async function parseTable(bytes){try{return await parseWorkbookIsolated(bytes);}catch{throw Object.assign(new Error('파일에서 물품 표를 읽지 못했습니다. 형식·용량·암호화 여부를 확인하세요.'),{status:400,code:'TABLE_PARSE_FAILED'});}}
export function mountDocumentImports(app,db,{env=process.env,fetcher=fetch}={}){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_DOCUMENT_BYTES,files:1,fields:2}}),active=new Set();let parsing=0;
 const guard=user=>{business(user);const n=db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE actor_id=? AND action='DOCUMENT_IMPORT_REQUEST' AND created_at>?").get(user.id,new Date(Date.now()-3600000).toISOString()).n;must(n<30,'파일 처리의 시간당 한도를 넘었습니다.',429);must(parsing<2,'다른 파일을 분석 중입니다. 잠시 후 다시 시도하세요.',429);audit(db,user,'DOCUMENT_IMPORT_REQUEST',user.id);};
 const original=(batchId)=>db.prepare('SELECT * FROM import_documents WHERE batch_id=?').get(batchId);
 const checkOriginal=source=>must(sha256(Buffer.from(source.bytes))===source.sha256,'원본 무결성 검사에 실패했습니다. 원본을 변경하지 말고 관리자에게 확인하세요.',409,'SOURCE_INTEGRITY_FAILED');
 const response=(id,user)=>uploadView(db,loadImport(db,user,id));
 function pending(id,message,code){const b=db.prepare('SELECT workbook FROM import_batches WHERE id=?').get(id);const w=JSON.parse(b.workbook);w.conversion={state:'WAITING',code,message};db.prepare('UPDATE import_batches SET workbook=? WHERE id=?').run(JSON.stringify(w),id);}
 async function finish(id,user,bytes,{kind,method,derivedName,inputHash,summary,warnings=[]}){
  // The original binary is immutable; derived XLSX must pass the existing isolated parser.
  const workbook=await parseTable(bytes);workbook.inputFormat=kind;workbook.conversion={state:'READY',method,derivedName,outputHash:sha256(bytes),readyAt:now(),summary};workbook.warnings=[...(workbook.warnings||[]),...warnings];
  const images=await saveImportImages(db,id,workbook.images);
  if(images.length<(workbook.images||[]).length)workbook.warnings=[...(workbook.warnings||[]),'일부 삽입 사진을 안전하게 읽지 못했습니다. 현물사진을 별도로 첨부하세요.'];
  transaction(db,()=>{db.prepare('INSERT INTO import_document_exports(batch_id,bytes,sha256,created_at) VALUES(?,?,?,?)').run(id,bytes,sha256(bytes),now());db.prepare('UPDATE import_batches SET workbook=? WHERE id=?').run(JSON.stringify({...workbook,images:undefined}),id);db.prepare('UPDATE import_documents SET derived_hash=?,derived_name=?,method=?,updated_at=? WHERE batch_id=?').run(sha256(bytes),derivedName,method,now(),id);audit(db,user,'DOCUMENT_PARSE_READY',id,{kind,method,inputHash,derivedHash:sha256(bytes),sheets:workbook.sheets.length});});
 }
 async function attemptOzd(id,user){
  const batch=loadImport(db,user,id),source=original(id);must(source?.kind==='OZD','OZD 원본을 찾을 수 없습니다.',404);checkOriginal(source);
  if(batch.workbook.conversion?.state==='READY')return;
  must(!active.has(id),'이 파일의 변환이 진행 중입니다.',409);active.add(id);
  try{
   let converted;
   try{converted=await convertNativeOzdIsolated(Buffer.from(source.bytes));}
   catch(e){
    // Legacy bridge is opt-in only. Native supported lists never leave this process/host.
    if(env.OZD_LEGACY_BRIDGE_FALLBACK==='true'&&ozdStatus(env).configured&&e.code==='OZD_NATIVE_UNSUPPORTED')converted=await convertOzd(Buffer.from(source.bytes),{env,fetcher});
    else throw e;
   }
   await finish(id,user,converted.bytes,{kind:'OZD',method:converted.method,derivedName:batch.name.replace(/\.ozd$/i,'.xlsx'),inputHash:source.sha256,summary:converted.summary,warnings:converted.warnings});
  }
  catch(e){const code=e.code?.startsWith('OZD_')?e.code:'OZD_TABLE_INVALID';const message=e.code?.startsWith('OZD_')?e.message:'변환 결과에서 유효한 물품 표를 읽지 못했습니다. 변환 양식을 확인하거나 변환 엑셀을 연결하세요.';pending(id,message,code);audit(db,user,'OZD_CONVERSION_WAITING',id,{code});}
  finally{active.delete(id);}
 }
 app.get('/api/imports/capabilities',(req,res)=>{business(req.user);res.json({extensions:['xlsx','xls','ozd'],maxBytes:MAX_DOCUMENT_BYTES,ozd:{configured:true,ready:true,mode:'BUILTIN_NATIVE',parser:PARSER_VERSION,message:'에듀파인 소요조회 OZD를 프로그램 내부에서 직접 엑셀로 변환합니다. 비밀번호 없는 OZP 3.0.0.1 소요조회 표를 지원합니다.',legacyFallback:env.OZD_LEGACY_BRIDGE_FALLBACK==='true'&&ozdStatus(env).configured}});});
 app.post('/api/imports/documents',upload.single('file'),async(req,res)=>{
  guard(req.user);must(req.file,'파일을 선택하세요.');const name=normalizeUploadName(req.file.originalname),ext=extname(name).toLowerCase();must(['.xlsx','.xls','.ozd'].includes(ext),'엑셀(XLSX·XLS) 또는 OZD 파일을 선택하세요.');
  if(ext==='.ozd')assertOzd(req.file.buffer);
  parsing++;let id;
  try{
   if(ext!=='.ozd'){
    const workbook=await parseTable(req.file.buffer);workbook.inputFormat=ext==='.xlsx'?'XLSX':'XLS';workbook.conversion={state:'READY',method:'DIRECT'};
    id=transaction(db,()=>{const next=storeImport(db,req.user,name,req.file.buffer,workbook);db.prepare('INSERT INTO import_documents VALUES(?,?,?,?,?,?,?,?,?)').run(next,workbook.inputFormat,req.file.buffer,sha256(req.file.buffer),sha256(req.file.buffer),name,'DIRECT',now(),now());return next;});
    const safe=await saveImportImages(db,id,workbook.images);if(safe.length<(workbook.images||[]).length){workbook.warnings=[...(workbook.warnings||[]),'일부 삽입 사진을 읽지 못했습니다.'];db.prepare('UPDATE import_batches SET workbook=? WHERE id=?').run(JSON.stringify({...workbook,images:undefined}),id);}
   }else{
    const workbook={sheets:[],inputFormat:'OZD',warnings:[],conversion:{state:'WAITING',code:'OZD_NATIVE_PENDING',message:'OZD 원본을 보관했습니다. 내부 소요조회 데이터를 직접 분석합니다.'}};
    id=transaction(db,()=>{const next=storeImport(db,req.user,name,req.file.buffer,workbook);db.prepare('INSERT INTO import_documents VALUES(?,?,?,?,?,?,?,?,?)').run(next,'OZD',req.file.buffer,sha256(req.file.buffer),'','','PENDING',now(),now());return next;});
    await attemptOzd(id,req.user);
   }
   const view=response(id,req.user);res.status(view.conversion?.state==='WAITING'?202:200).json(view);
  }finally{parsing--;}
 });
 app.post('/api/imports/:id/retry-conversion',async(req,res)=>{guard(req.user);parsing++;try{await attemptOzd(req.params.id,req.user);res.json(response(req.params.id,req.user));}finally{parsing--;}});
 app.post('/api/imports/:id/converted',upload.single('file'),async(req,res)=>{
  guard(req.user);const batch=loadImport(db,req.user,req.params.id),source=original(batch.id);must(source?.kind==='OZD','OZD 원본에만 변환 엑셀을 연결합니다.',400);checkOriginal(source);must(batch.workbook.conversion?.state!=='READY','이미 해석한 원본은 덮어쓰지 않습니다.',409);must(req.body.confirmed==='true','같은 OZD에서 내보낸 엑셀인지 확인해야 합니다.');must(req.file&&/\.xlsx$/i.test(req.file.originalname),'OZ Viewer에서 저장한 XLSX 파일을 선택하세요.');must(!active.has(batch.id),'이 파일의 변환이 진행 중입니다.',409);active.add(batch.id);parsing++;
  try{await finish(batch.id,req.user,req.file.buffer,{kind:'OZD',method:'MANUAL_EXPORTED_XLSX',derivedName:normalizeUploadName(req.file.originalname),inputHash:source.sha256});res.json(response(batch.id,req.user));}
  finally{parsing--;active.delete(batch.id);}
 });
 app.get('/api/imports/:id/export.xlsx',(req,res)=>{
  business(req.user);
  const b=db.prepare('SELECT b.name,d.bytes AS original_bytes,d.sha256 AS original_hash,d.derived_hash,e.bytes,e.sha256 FROM import_batches b JOIN import_documents d ON d.batch_id=b.id JOIN import_document_exports e ON e.batch_id=b.id WHERE b.id=? AND b.org_id=?').get(req.params.id,req.user.org_id);
  must(b,'변환 엑셀이 없거나 접근 권한이 없습니다.',404);
  const bytes=Buffer.from(b.bytes);must(sha256(bytes)===b.sha256&&b.derived_hash===b.sha256&&sha256(Buffer.from(b.original_bytes))===b.original_hash,'원본 또는 변환 엑셀 무결성 검사에 실패했습니다.',409);
  const name=b.name.replace(/\.ozd$/i,'')+'_변환.xlsx';
  res.type(XLSX_MIME).set('Content-Disposition',`attachment; filename="converted.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`).set('Cache-Control','private, no-store').send(bytes);
 });
 app.get('/api/imports/:id/original',(req,res)=>{business(req.user);const b=db.prepare('SELECT b.name,d.* FROM import_batches b JOIN import_documents d ON d.batch_id=b.id WHERE b.id=? AND b.org_id=?').get(req.params.id,req.user.org_id);must(b,'원본이 없거나 권한이 없습니다.',404);const bytes=Buffer.from(b.bytes);must(sha256(bytes)===b.sha256,'원본 무결성 검사에 실패했습니다.',409);res.type('application/octet-stream').set('Content-Disposition',`attachment; filename="source.${b.kind.toLowerCase()}"; filename*=UTF-8''${encodeURIComponent(b.name)}`).send(bytes);});
}
