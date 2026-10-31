import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {fixture,draft} from './helpers.mjs';
import {createApp} from '../server/app.mjs';
const origin='http://localhost:4310';
test('HTTPS 프록시 설정은 HTTP를 고정 출처로 전환하고 HTTPS·내부 헬스체크를 허용',async t=>{
  const f=fixture(),dir=mkdtempSync(join(tmpdir(),'trade-https-'));
  const secureOrigin='https://trade.h19h19.com';
  const server=createApp(f.db,{dataDir:dir,origin:secureOrigin}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));f.db.close();rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const redirect=await fetch(base+'/api/lots?mine=true',{redirect:'manual',headers:{'X-Forwarded-Proto':'http',Host:'untrusted.example'}});
  assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),secureOrigin+'/api/lots?mine=true');
  assert.equal(redirect.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'/api/health',{headers:{'X-Forwarded-Proto':'https'}})).status,200);
  assert.equal((await fetch(base+'/api/health')).status,200);
});
async function setup(t){const f=fixture(),dir=mkdtempSync(join(tmpdir(),'trade-http-'));const server=createApp(f.db,{dataDir:dir,origin}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;t.after(async()=>{await new Promise(r=>server.close(r));f.db.close();rmSync(dir,{recursive:true,force:true});});const login=async(email='editor@test.local')=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password:'TestingPassword!26'})});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};};return {...f,base,login};}
test('로그인 없는 업무 조회와 Origin 없는 로그인 차단',async t=>{const f=await setup(t);assert.equal((await fetch(f.base+'/api/lots')).status,401);assert.equal((await fetch(f.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);});
test('세션 쿠키 보안 속성·CSRF·악성 Origin 차단',async t=>{const f=await setup(t);const raw=await fetch(f.base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'editor@test.local',password:'TestingPassword!26'})});assert.match(raw.headers.get('set-cookie'),/HttpOnly/);assert.match(raw.headers.get('set-cookie'),/SameSite=Lax/);const s=await f.login();assert.equal((await fetch(f.base+'/api/lots',{method:'POST',headers:{Cookie:s.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(draft())})).status,403);assert.equal((await fetch(f.base+'/api/lots',{method:'POST',headers:{Cookie:s.cookie,Origin:'https://evil.test','X-CSRF-Token':s.csrf,'Content-Type':'application/json'},body:JSON.stringify(draft())})).status,403);});
test('현물사진 업로드·재인코딩·초안 비공개·삭제 실제 HTTP 검증',async t=>{const f=await setup(t),s=await f.login(),headers={Cookie:s.cookie,Origin:origin,'X-CSRF-Token':s.csrf};const created=await fetch(f.base+'/api/lots',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(draft())});assert.equal(created.status,201);const {id}=await created.json();const image=await sharp({create:{width:40,height:30,channels:3,background:'#abcdef'}}).png().toBuffer();const form=new FormData();form.set('lotId',id);form.set('kind','PHOTO');form.set('file',new Blob([image],{type:'image/png'}),'picture.png');const uploaded=await fetch(f.base+'/api/files',{method:'POST',headers,body:form});assert.equal(uploaded.status,201,JSON.stringify(await uploaded.clone().json()));const file=await uploaded.json();assert.equal(file.mime,'image/webp');const own=await fetch(f.base+'/api/files/'+file.id,{headers:{Cookie:s.cookie}});assert.equal(own.status,200);assert.match(own.headers.get('content-type'),/webp/);const b=await f.login('buyer@test.local');assert.equal((await fetch(f.base+'/api/files/'+file.id,{headers:{Cookie:b.cookie}})).status,404);assert.equal((await fetch(f.base+'/api/files/'+file.id,{method:'DELETE',headers})).status,200);});
test('관리자만 계정을 발급, 운영관리자에게 업무 자료는 차단',async t=>{const f=await setup(t),s=await f.login();assert.equal((await fetch(f.base+'/api/admin',{headers:{Cookie:s.cookie}})).status,403);const a=await f.login('admin@test.local');assert.equal((await fetch(f.base+'/api/admin',{headers:{Cookie:a.cookie}})).status,200);assert.equal((await fetch(f.base+'/api/lots',{headers:{Cookie:a.cookie}})).status,403);});
