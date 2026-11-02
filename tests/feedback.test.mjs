import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {fixture} from './helpers.mjs';
import {uid,openDatabase} from '../server/db.mjs';
import {createApp} from '../server/app.mjs';
import {createBackup,restoreBackup,verifyStorage} from '../scripts/storage.mjs';
import {KnowledgeBase} from '../server/rag/search.mjs';

async function server(t){
  const root=mkdtempSync(join(tmpdir(),'trade-feedback-')),dir=join(root,'data'),f=fixture(join(dir,'trade.sqlite'));
  const origin='http://localhost:4310',app=createApp(f.db,{dataDir:dir,origin}),http=app.listen(0,'127.0.0.1');
  await new Promise(r=>http.once('listening',r));const base='http://127.0.0.1:'+http.address().port;
  t.after(async()=>{await new Promise(r=>http.close(r));app.locals.closeRag();f.db.close();rmSync(root,{recursive:true,force:true});});
  const login=async(email='editor@test.local')=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password:'TestingPassword!26'})});assert.equal(r.status,200);return {Cookie:r.headers.get('set-cookie').split(';')[0],Origin:origin,'X-CSRF-Token':(await r.json()).csrf};};
  const submit=(headers,files=[],data={})=>{const form=new FormData();for(const[k,v]of Object.entries({title:'모바일 화면 개선',category:'USABILITY',body:'합성 검수: 모바일 버튼을 더 쉽게 찾을 수 있으면 좋겠습니다.',page:'물품 올리기',requestKey:uid(),...data}))form.set(k,v);for(const f of files)form.append('files',new Blob([f.bytes],{type:f.mime||'application/octet-stream'}),f.name);return fetch(base+'/api/feedback',{method:'POST',headers,body:form});};
  return {...f,root,dir,base,login,submit};
}
const pdf=name=>({name,bytes:Buffer.from('%PDF-1.4\nSYNTHETIC FEEDBACK FILE\n%%EOF')});
const patch=(h,headers,id,body)=>fetch(h.base+'/api/feedback/'+id,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('개선사항은 작성자·관리자만 조회하고 첨부도 같은 권한을 적용',async t=>{
  const h=await server(t),owner=await h.login(),sameOrg=await h.login('reviewer@test.local'),other=await h.login('buyer@test.local'),admin=await h.login('admin@test.local');
  assert.equal((await fetch(h.base+'/api/feedback')).status,401);
  const posted=await h.submit(owner,[pdf('개선_설명.pdf')]);assert.equal(posted.status,201);const {id}=await posted.json();
  const detail=await(await fetch(h.base+'/api/feedback/'+id,{headers:owner})).json(),file=detail.attachments[0];assert.equal(detail.status,'RECEIVED');assert.equal(file.name,'개선_설명.pdf');
  for(const headers of [sameOrg,other]){
    assert.deepEqual(await(await fetch(h.base+'/api/feedback',{headers})).json(),[]);
    assert.equal((await fetch(h.base+'/api/feedback/'+id,{headers})).status,404);
    assert.equal((await fetch(h.base+'/api/files/'+file.id,{headers})).status,404);
  }
  for(const headers of [owner,admin]){const r=await fetch(h.base+'/api/files/'+file.id,{headers});assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);assert.match(r.headers.get('content-disposition'),new RegExp(encodeURIComponent('개선_설명.pdf')));assert.equal(r.headers.get('cache-control'),'no-store');}
  assert.equal((await(await fetch(h.base+'/api/feedback',{headers:admin})).json()).length,1);
  const csrf=await h.submit({...owner,'X-CSRF-Token':''});assert.equal(csrf.status,403);
});

test('한글 사진을 재인코딩·메타데이터 제거하며 미리보기와 다운로드를 보호',async t=>{
  const h=await server(t),owner=await h.login(),other=await h.login('buyer@test.local');
  const bytes=await sharp({create:{width:60,height:40,channels:3,background:'#dcefe4'}}).jpeg().withMetadata({exif:{IFD0:{Copyright:'synthetic'}}}).toBuffer();
  const r=await h.submit(owner,[{name:'화면_오류.jpg',bytes,mime:'image/jpeg'}]);assert.equal(r.status,201);const {id}=await r.json();
  const d=await(await fetch(h.base+'/api/feedback/'+id,{headers:owner})).json(),f=d.attachments[0];assert.equal(f.mime,'image/webp');
  const url=h.base+'/api/feedback/'+id+'/attachments/'+f.id+'/preview';const preview=await fetch(url,{headers:owner});assert.equal(preview.status,200);const m=await sharp(Buffer.from(await preview.arrayBuffer())).metadata();assert.equal(m.format,'webp');assert.equal(m.exif,undefined);
  assert.equal((await fetch(url,{headers:other})).status,404);assert.equal((await fetch(url)).status,401);
  const download=await fetch(h.base+'/api/files/'+f.id,{headers:owner});assert.match(download.headers.get('content-disposition'),new RegExp(encodeURIComponent('화면_오류.webp')));
});

test('동일 접수 재시도는 중복 파일을 만들지 않고 변경된 재시도는 충돌',async t=>{
  const h=await server(t),owner=await h.login(),requestKey=uid();
  const responses=await Promise.all([h.submit(owner,[pdf('참고.pdf')],{requestKey}),h.submit(owner,[pdf('참고.pdf')],{requestKey})]);
  const results=await Promise.all(responses.map(r=>r.json()));assert.equal(results[0].id,results[1].id);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM feedback').get().n,1);assert.equal(readdirSync(join(h.dir,'uploads')).length,1);
  assert.equal((await h.submit(owner,[pdf('참고.pdf')],{requestKey,title:'달라진 내용'})).status,409);
});

test('관리자만 상태·답변을 저장하며 낡은 버전으로 덮어쓸 수 없음',async t=>{
  const h=await server(t),owner=await h.login(),admin=await h.login('admin@test.local');const {id}=await(await h.submit(owner)).json();
  assert.equal((await patch(h,owner,id,{status:'DONE',reply:'임의 반영',version:1})).status,403);
  assert.equal((await patch(h,admin,id,{status:'REVIEWING',reply:'화면 재현을 확인하고 있습니다.',version:1})).status,200);
  assert.equal((await patch(h,admin,id,{status:'DONE',reply:'낡은 답변',version:1})).status,409);
  const d=await(await fetch(h.base+'/api/feedback/'+id,{headers:owner})).json();assert.equal(d.status,'REVIEWING');assert.equal(d.reply,'화면 재현을 확인하고 있습니다.');assert.equal(d.version,2);
});

test('잘못된 파일·초과 크기·수량을 거부하고 SQL 저장 실패는 새 파일까지 전체 롤백',async t=>{
  const h=await server(t),owner=await h.login();await h.submit(owner,[pdf('기존.pdf')]);const before=readdirSync(join(h.dir,'uploads'));
  assert.equal((await h.submit(owner,[pdf('정상.pdf'),{name:'실행.html',bytes:Buffer.from('<html>blocked</html>')}])).status,400);
  assert.equal((await h.submit(owner,[{name:'과대.pdf',bytes:Buffer.alloc(8*1048576+1)}])).status,400);
  assert.equal((await h.submit(owner,Array.from({length:6},(_,i)=>pdf(i+'.pdf')))).status,400);
  const five=await h.submit(owner,Array.from({length:5},(_,i)=>pdf('다섯-'+i+'.pdf')));assert.equal(five.status,201);
  const savedCount=h.db.prepare('SELECT COUNT(*) n FROM feedback').get().n,files=readdirSync(join(h.dir,'uploads'));
  h.db.exec("CREATE TRIGGER break_feedback_file BEFORE INSERT ON files WHEN NEW.name='중단.pdf' BEGIN SELECT RAISE(ABORT,'TEST_FILE_FAILURE'); END;");
  assert.equal((await h.submit(owner,[pdf('새파일.pdf'),pdf('중단.pdf')])).status,500);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM feedback').get().n,savedCount);assert.deepEqual(readdirSync(join(h.dir,'uploads')),files);assert.ok(before.every(name=>files.includes(name)));
});

test('의견 첨부가 기존 백업·복원 검증에 포함되고 RAG에는 의견 본문이 노출되지 않음',async t=>{
  const h=await server(t),owner=await h.login();const privateText='비공개_검수문구_0cc71_의견내용';const {id}=await(await h.submit(owner,[pdf('복원_첨부.pdf')],{body:privateText})).json();
  const before=verifyStorage(h.dir);assert.equal(before.files,1);
  const dest=join(h.root,'backup'),restored=join(h.root,'restored');await createBackup(h.dir,dest);restoreBackup(dest,restored);assert.equal(verifyStorage(restored).files,1);
  const db=openDatabase(join(restored,'trade.sqlite'));assert.equal(db.prepare('SELECT body FROM feedback WHERE id=?').get(id).body,privateText);db.close();
  const k=new KnowledgeBase();try{const s=k.search('개선사항 접수');assert.equal(s[0].documentId,'APP-FEEDBACK');assert.equal(s[0].route,'/feedback');assert.ok(!JSON.stringify(s).includes(privateText));}finally{k.close();}
});

test('v2→v3 마이그레이션은 기존 사용자·물품 테이블을 그대로 보존하고 멱등',t=>{
  const root=mkdtempSync(join(tmpdir(),'trade-feedback-migrate-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const path=join(root,'trade.sqlite'),f=fixture(path);
  f.db.exec('DROP TABLE feedback_attachments; DROP TABLE feedback; PRAGMA user_version=2');
  const users=f.db.prepare('SELECT * FROM users ORDER BY id').all();f.db.close();
  let db=openDatabase(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,3);assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),users);db.close();
  db=openDatabase(path);assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback').get().n,0);assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),users);db.close();
});
