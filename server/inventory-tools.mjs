import {z} from 'zod';
import {join} from 'node:path';
import {writeFileSync,unlinkSync} from 'node:fs';
import sharp from 'sharp';
import {uid,now,must,transaction,audit} from './db.mjs';
import {hash} from './auth.mjs';
import * as svc from './service.mjs';
import {IMPORT_FIELDS} from './excel-parser.mjs';
import {loadImport} from './excel-import.mjs';

export function importImageList(db,batchId){return db.prepare('SELECT id,sheet,row_number AS row,end_row AS endRow,column_number AS col,name,file_id AS attachedFileId FROM import_images WHERE batch_id=? ORDER BY sheet,row_number,column_number').all(batchId);}
export async function saveImportImages(db,batchId,images){
 const safe=[];for(const p of images||[]){try{const image=sharp(Buffer.from(p.bytes,'base64'),{limitInputPixels:16000000});const m=await image.metadata();if(!['jpeg','png','webp'].includes(m.format))continue;const bytes=await image.rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();if(bytes.length>1024*1024)continue;safe.push({...p,bytes});}catch{}}
 transaction(db,()=>{for(const p of safe)db.prepare('INSERT INTO import_images VALUES(?,?,?,?,?,?,?,?,?,NULL)').run(uid(),batchId,p.sheet,p.row,p.endRow,p.col,p.name,p.bytes,hash(p.bytes));});
 return importImageList(db,batchId);
}
export function uploadView(db,batch){const workbook=batch.workbook;return {id:batch.id,name:batch.name,fields:IMPORT_FIELDS.map(([key,label])=>({key,label})),sheets:workbook.sheets.map(s=>({...s,rows:s.rows.slice(0,35),rowCount:s.rows.length})),images:importImageList(db,batch.id),warnings:workbook.warnings||[]};}
export function attachImportImages(db,user,batchId,input,dataDir){
 svc.business(user);const batch=db.prepare('SELECT * FROM import_batches WHERE id=? AND org_id=?').get(batchId,user.org_id);must(batch,'본 기관 업로드만 이용할 수 있습니다.',404);
 const d=z.object({physicalConfirmed:z.literal(true),privacyConfirmed:z.literal(true),images:z.array(z.object({id:z.string().uuid(),rowNumber:z.number().int().min(1).max(2040)})).min(1).max(30)}).parse(input);
 must(new Set(d.images.map(x=>x.id)).size===d.images.length,'사진이 중복 선택되었습니다.');const written=[];
 try{return transaction(db,()=>{let added=0,reused=0;const changed=new Set();
  for(const selection of d.images){
   const p=db.prepare('SELECT * FROM import_images WHERE id=? AND batch_id=?').get(selection.id,batch.id);must(p,'업로드의 사진을 선택하세요.',404);
   const link=db.prepare('SELECT lot_id FROM imported_rows WHERE org_id=? AND file_hash=? AND sheet=? AND row_number=?').get(user.org_id,batch.file_hash,p.sheet,selection.rowNumber);must(link,'등록을 완료한 데이터 행을 선택하세요.');
   const lot=svc.ownLot(db,user,link.lot_id);must(lot.state==='DRAFT','사진은 비공개 초안에서만 연결합니다.',409);
   if(p.file_id){const prior=db.prepare('SELECT lot_id FROM files WHERE id=?').get(p.file_id);must(prior?.lot_id===lot.id,'다른 물품에 이미 연결한 사진입니다.',409);reused++;continue;}
   const count=db.prepare('SELECT COUNT(*) AS n FROM files WHERE lot_id=?').get(lot.id).n;must(count<30,'묶음당 첨부는 최대 30개입니다.');
   const id=uid(),diskName=id+'.webp',path=join(dataDir,'uploads',diskName);writeFileSync(path,p.bytes,{mode:0o600,flag:'wx'});written.push(path);
   const name=`엑셀_${p.row_number}행_${p.name}`;db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.org_id,lot.id,null,'PHOTO',name,'image/webp',diskName,p.sha256,p.bytes.length,user.id,now());
   db.prepare('INSERT INTO photo_metadata VALUES(?,?,?,?,?)').run(id,JSON.parse(lot.data).title,'OVERVIEW',user.id,now());
   db.prepare('UPDATE import_images SET file_id=? WHERE id=?').run(id,p.id);changed.add(lot.id);added++;
   audit(db,user,'FILE_UPLOAD',id,{lotId:lot.id,source:'EXCEL_EMBEDDED',batchId,sheet:p.sheet,anchorRow:p.row_number,chosenRow:selection.rowNumber,physicalConfirmed:true,privacyConfirmed:true,hash:p.sha256});
  }
  for(const id of changed)db.prepare('UPDATE lots SET version=version+1,updated_at=? WHERE id=?').run(now(),id);
  return {added,reused};
 });}catch(e){for(const path of written){try{unlinkSync(path);}catch{}}throw e;}
}
export function mountInventoryTools(app,db,{dataDir}){
 app.get('/api/imports',(req,res)=>{svc.business(req.user);const offset=z.coerce.number().int().min(0).max(100000).parse(req.query.offset??0);const batches=db.prepare('SELECT id,name,file_hash,created_at FROM import_batches WHERE org_id=? ORDER BY created_at DESC LIMIT 30 OFFSET ?').all(req.user.org_id,offset);
  res.json({items:batches.map(b=>({...b,expired:Date.now()-Date.parse(b.created_at)>86400000,lotIds:db.prepare('SELECT DISTINCT lot_id FROM imported_rows WHERE org_id=? AND file_hash=?').all(req.user.org_id,b.file_hash).map(r=>r.lot_id),images:db.prepare('SELECT COUNT(*) AS n FROM import_images WHERE batch_id=?').get(b.id).n})),nextOffset:batches.length===30?offset+30:null});
 });
 app.get('/api/imports/:id/resume',(req,res)=>res.json(uploadView(db,loadImport(db,req.user,req.params.id))));
 app.get('/api/imports/:id/images',(req,res)=>{svc.business(req.user);must(db.prepare('SELECT 1 FROM import_batches WHERE id=? AND org_id=?').get(req.params.id,req.user.org_id),'권한이 없습니다.',404);res.json(importImageList(db,req.params.id));});
 app.get('/api/import-images/:id',(req,res)=>{svc.business(req.user);const p=db.prepare('SELECT i.bytes FROM import_images i JOIN import_batches b ON b.id=i.batch_id WHERE i.id=? AND b.org_id=?').get(req.params.id,req.user.org_id);must(p,'사진이 없거나 권한이 없습니다.',404);res.type('image/webp').send(Buffer.from(p.bytes));});
 app.post('/api/imports/:id/images/attach',(req,res)=>res.json(attachImportImages(db,req.user,req.params.id,req.body,dataDir)));
 app.get('/api/inventory/summary',(req,res)=>{
  const lots=svc.listLots(db,req.user,{mine:true});const rows=lots.map(l=>({id:l.id,title:l.title,listingNo:l.listingNo||'',department:l.department||'미지정',specification:l.specification||'',state:l.state,registered:l.data.actualCount,ledger:l.source.ledgerCount,available:l.state==='PUBLISHED'&&l.decisionStatus==='VERIFIED'?l.available:0}));
  const groups=new Map();for(const r of rows){const d=groups.get(r.department)||{department:r.department,lots:0,registered:0,available:0};d.lots++;d.registered+=r.registered;d.available+=r.available;groups.set(r.department,d);}
  res.json({departments:[...groups.values()],rows,notice:'등록 수량은 엑셀·조사 기록이며 현재 보유량 확정값이 아닙니다. 신청 가능은 게시 중 물품에서 배정·인계 수량을 제외한 값입니다.'});
 });
}
