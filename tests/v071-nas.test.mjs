import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './helpers.mjs';
import {openDatabase} from '../server/db.mjs';
import {importAssets} from '../server/service.mjs';

for(const flavor of ['nas-v06','main-v07'])test(`schema4 ${flavor} → schema5 preserves every existing row and adds missing features`,t=>{
 const dir=mkdtempSync(join(tmpdir(),'trade-v071-')),file=join(dir,'trade.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const f=fixture(file);
 importAssets(f.db,f.editor,[{externalId:'KEEP-V4',originalName:'합성 보존 원본',quantity:7}]);
 if(flavor==='nas-v06'){
  f.db.exec('DROP TABLE import_documents');
  f.db.prepare('INSERT INTO feedback(id,org_id,user_id,title,category,body,request_key,payload_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('keep-feedback',f.editor.org_id,f.editor.id,'합성 의견','FEATURE','보존 내용','synthetic-key','synthetic-hash','2026-01-01','2026-01-01');
 }else{
  f.db.exec('DROP TABLE feedback_attachments; DROP TABLE feedback');
  f.db.prepare('INSERT INTO import_batches VALUES(?,?,?,?,?,?,?)').run('keep-import',f.editor.org_id,f.editor.id,'synthetic-hash','합성.xlsx','{}','2026-01-01');
  f.db.prepare('INSERT INTO import_documents VALUES(?,?,?,?,?,?,?,?,?)').run('keep-import','XLSX',Buffer.from('SYNTHETIC SOURCE BYTES'),'synthetic-hash','','','DIRECT','2026-01-01','2026-01-01');
 }
 f.db.exec('PRAGMA user_version=4');
 const before=Object.fromEntries(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({name})=>[name,f.db.prepare(`SELECT * FROM "${name}"`).all()]));f.db.close();
 for(let attempt=0;attempt<2;attempt++){
  const db=openDatabase(file);
  try{
   assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);
   for(const [name,rows]of Object.entries(before))assert.deepEqual(db.prepare(`SELECT * FROM "${name}"`).all(),rows,name);
   for(const name of ['import_documents','feedback','feedback_attachments','catalog_images'])assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
   assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
   assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
   assert.throws(()=>db.exec('UPDATE assets SET quantity=8'),/ORIGINAL_ASSET_IMMUTABLE/);
  }finally{db.close();}
 }
});
