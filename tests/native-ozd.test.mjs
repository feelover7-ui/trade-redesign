import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as XLSX from 'xlsx';
import {convertNativeOzd,readOzpEntries} from '../server/ozd/native.mjs';
import {convertNativeOzdIsolated} from '../server/ozd/worker.mjs';
import {makeOzd,syntheticRows,demandFields,makeModule} from './fixtures/native-ozd.mjs';
import {createApp} from '../server/app.mjs';
import {fixture} from './helpers.mjs';
import {sha256,XLSX_MIME} from '../server/ozd-converter.mjs';
import {getLot} from '../server/service.mjs';
import {migrateEnhancements} from '../server/migrations.mjs';
const rowsOf=bytes=>XLSX.utils.sheet_to_json(XLSX.read(bytes,{type:'buffer'}).Sheets['소요조회물품목록'],{header:1});
async function harness(t,env={}){
 const dir=mkdtempSync(join(tmpdir(),'trade-native-')),f=fixture();let externalCalls=0;
 const app=createApp(f.db,{dataDir:dir,origin:'http://localhost:4310',enhancements:{env,fetcher:async()=>{externalCalls++;throw Error('External access not permitted in native fixture');}}});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const url='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{app.locals.closeRag?.();await new Promise(r=>server.close(r));f.db.close();rmSync(dir,{recursive:true,force:true});});
 const login=async(name='editor')=>{const r=await fetch(url+'/api/auth/login',{method:'POST',headers:{Origin:'http://localhost:4310','Content-Type':'application/json'},body:JSON.stringify({email:name+'@test.local',password:'TestingPassword!26'})});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};};
 const session=await login();
 const request=(path,{method='GET',body,form,auth=session,csrf=true}={})=>fetch(url+'/api'+path,{method,headers:{Origin:'http://localhost:4310',...(auth?{Cookie:auth.cookie,...(csrf?{'X-CSRF-Token':auth.csrf}:{})}:{}),...(body?{'Content-Type':'application/json'}:{})},body:form||(body?JSON.stringify(body):undefined)});
 const upload=async(bytes=makeOzd())=>{const form=new FormData();form.set('file',new Blob([bytes]),'합성_소요조회.ozd');return request('/imports/documents',{method:'POST',form});};
 return {...f,request,login,upload,externalCalls:()=>externalCalls};
}
test('네이티브: 실제 포장형 합성 OZD를 외부 프로그램 없이 XLSX로 변환, 원본 9개 열 보존',async()=>{
 const input=makeOzd(),result=await convertNativeOzdIsolated(input);assert.equal(result.method,'NATIVE_OZP3_DEMAND');assert.equal(result.summary.rows,2);assert.equal(result.summary.totalQuantity,33);assert.equal(result.summary.externalProgram,false);assert.equal(result.inputHash,sha256(input));
 const rows=rowsOf(result.bytes);assert.deepEqual(rows[1],['56101703-00001234',syntheticRows()[0].THNG_NM,31,'20181012','141000','폐품','0','56101703','00001234']);assert.equal(rows[2][4],'150000');assert.equal(rows[2][2],2);assert.equal(rows.length,3);assert.equal(globalThis.ozd_script_ran,undefined);
});
test('네이티브: 비압축 포장 표시와 기본 포장 표시에서 같은 셀 복원',()=>{assert.deepEqual(rowsOf(convertNativeOzd(makeOzd({plain:true})).bytes),rowsOf(convertNativeOzd(makeOzd()).bytes));});
test('네이티브: 비밀번호·다른 버전은 해제나 추정 없이 명시적 거부',()=>{
 assert.throws(()=>convertNativeOzd(makeOzd({password:'Protected'})),e=>e.code==='OZD_NATIVE_PASSWORD');
 assert.throws(()=>convertNativeOzd(makeOzd({version:[3,1,0,1]})),e=>e.code==='OZD_NATIVE_UNSUPPORTED');
 assert.throws(()=>convertNativeOzd(makeOzd({moduleVersion:9999})),e=>e.code==='OZD_NATIVE_UNSUPPORTED');
});
test('네이티브: 손상된 gzip·중복/중첩 디렉터리·잘린 파일·위조 파일 차단',()=>{
 for(const input of [makeOzd({corruptGzip:true}),makeOzd({duplicateEntry:true}),makeOzd({invalidDirectory:true}),makeOzd().subarray(0,100),Buffer.alloc(100)])assert.throws(()=>convertNativeOzd(input),e=>e.code?.startsWith('OZD_NATIVE_'));
});
test('네이티브: 압축팽창·과다행·빈 목록·지원하지 않는 셀형식·다중표 차단',()=>{
 assert.throws(()=>convertNativeOzd(makeOzd({rawModule:Buffer.alloc(9*1024*1024)})),e=>e.code==='OZD_NATIVE_INVALID');
 assert.throws(()=>convertNativeOzd(makeOzd({rows:[]})),e=>e.code==='OZD_NATIVE_ROW_LIMIT');
 assert.throws(()=>convertNativeOzd(makeOzd({rows:Array(2001).fill(syntheticRows()[0])})),e=>e.code==='OZD_NATIVE_ROW_LIMIT');
 assert.throws(()=>convertNativeOzd(makeOzd({fields:demandFields.map(([n,t])=>[n,n==='THNG_NM'?999:t])})),e=>e.code==='OZD_NATIVE_UNSUPPORTED');
 assert.throws(()=>convertNativeOzd(makeOzd({extraTable:true})),e=>e.code==='OZD_NATIVE_UNSUPPORTED');
});
test('네이티브: 부분 행 복원 금지, 수량 소수/잘못된 번호를 일부 성공 처리하지 않음',()=>{
 for(const patch of [{REQRE_INQIRE_QTY:'1.5'},{THNG_IDNTFC_CD:'1234'},{THNG_NM:''}])assert.throws(()=>convertNativeOzd(makeOzd({rows:[syntheticRows()[0],{...syntheticRows()[1],...patch}]})),e=>e.code==='OZD_NATIVE_ROW_INVALID');
});
test('네이티브: XLSX에서 번호 앞자리0·수식처럼 생긴 텍스트·빈 취득정보 보존',()=>{
 const rows=[{...syntheticRows()[0],THNG_NM:'=HYPERLINK("https://invalid.example")',ACQS_DTE:null,THNG_STS_NM:'미확인'}];const result=convertNativeOzd(makeOzd({rows}));const sheet=XLSX.read(result.bytes,{type:'buffer'}).Sheets['소요조회물품목록'];
 assert.equal(sheet.B2.t,'s');assert.equal(sheet.B2.f,undefined);assert.equal(sheet.I2.v,'00001234');assert.equal(sheet.D2.v,'');assert.equal(sheet.F2.v,'미확인');
});
test('네이티브 HTTP: 설정키·뷰어 없이 업로드→다운로드→미리보기→초안 등록·원본 보존',async t=>{
 const h=await harness(t);const input=makeOzd();const r=await h.upload(input);assert.equal(r.status,200);const b=await r.json();assert.equal(b.conversion.method,'NATIVE_OZP3_DEMAND');assert.equal(b.conversion.summary.rows,2);
 const s=b.sheets[0],config={sheet:s.name,headerRow:s.suggestedHeader,mapping:s.mapping};const preview=await(await h.request('/imports/'+b.id+'/preview',{method:'POST',body:config})).json();assert.equal(preview.errors.length,0);assert.equal(preview.totalQuantity,33);
 const received=await h.request('/imports/'+b.id+'/export.xlsx');assert.equal(received.status,200);assert(received.headers.get('content-type').startsWith(XLSX_MIME));const exported=Buffer.from(await received.arrayBuffer());assert.equal(sha256(exported),b.conversion.outputHash);assert.equal(rowsOf(exported)[1][5],'폐품');
 const result=await(await h.request('/imports/'+b.id+'/confirm',{method:'POST',body:config})).json();assert.equal(result.lotCount,2);const lot=getLot(h.db,h.editor,result.lotIds[0]);assert.equal(lot.state,'DRAFT');assert.equal(lot.groups[0].condition,'UNKNOWN');assert.equal(lot.sourceSummary.rows[0].condition,'폐품');assert.equal(lot.sourceSummary.rows[0].acquiredUnitPrice,'141000');
 assert.equal(sha256(Buffer.from(await(await h.request('/imports/'+b.id+'/original')).arrayBuffer())),sha256(input));assert.equal(h.externalCalls(),0);
 const again=await(await h.request('/imports/'+b.id+'/confirm',{method:'POST',body:config})).json();assert.equal(again.reused,true);
});
test('네이티브 HTTP: 지원 OZD는 기존 브릿지 키가 있더라도 외부 호출하지 않음',async t=>{
 const h=await harness(t,{OZD_BRIDGE_ENABLED:'true',OZD_BRIDGE_APPROVED:'true',OZD_BRIDGE_TOKEN:'SYNTHETIC-NEVER-SENT-TO-PROVIDER-1234567890',OZD_BRIDGE_URL:'http://127.0.0.1:4318/convert'});
 const caps=await(await h.request('/imports/capabilities')).json();assert.equal(caps.ozd.mode,'BUILTIN_NATIVE');assert.equal(caps.ozd.ready,true);assert.equal((await h.upload()).status,200);assert.equal(h.externalCalls(),0);
});
test('네이티브 HTTP: 다운로드 인증·역할·다른 기관 차단, 변조된 XLSX 거부',async t=>{
 const h=await harness(t),b=await(await h.upload()).json(),path='/imports/'+b.id+'/export.xlsx';
 assert.equal((await h.request(path,{auth:null})).status,401);assert.equal((await h.request(path,{auth:await h.login('buyer')})).status,404);assert.equal((await h.request(path,{auth:await h.login('admin')})).status,403);
 h.db.prepare('UPDATE import_document_exports SET bytes=? WHERE batch_id=?').run(Buffer.from('tampered'),b.id);assert.equal((await h.request(path)).status,409);
});
test('네이티브 HTTP: 이전 변환대기 OZD는 원본 재첨부 없이 직접 변환 재시도',async t=>{
 const h=await harness(t),input=makeOzd(),b=await(await h.upload(input)).json();const wb=JSON.parse(h.db.prepare('SELECT workbook FROM import_batches WHERE id=?').get(b.id).workbook);
 // Recreate a persisted v0.8 WAITING batch, preserving its original bytes and hash.
 h.db.prepare('DELETE FROM import_document_exports WHERE batch_id=?').run(b.id);wb.sheets=[];wb.conversion={state:'WAITING',code:'OZD_CONVERTER_REQUIRED'};h.db.prepare('UPDATE import_batches SET workbook=?,created_at=? WHERE id=?').run(JSON.stringify(wb),'2020-01-01T00:00:00Z',b.id);h.db.prepare("UPDATE import_documents SET method='PENDING',derived_hash='',derived_name='' WHERE batch_id=?").run(b.id);
 const r=await h.request('/imports/'+b.id+'/retry-conversion',{method:'POST'});assert.equal(r.status,200);assert.equal((await r.json()).conversion.method,'NATIVE_OZP3_DEMAND');assert.equal(h.externalCalls(),0);
});
test('네이티브 HTTP: 미지원·암호·손상 파일은 원본 대기와 0건 생성 유지',async t=>{
 const h=await harness(t);for(const input of [makeOzd({password:'Protected'}),makeOzd({corruptGzip:true}),makeOzd({version:[4,0,0,1]})]){
  const r=await h.upload(input);assert.equal(r.status,202);const b=await r.json();assert.equal(b.conversion.state,'WAITING');assert.equal((await h.request('/imports/'+b.id+'/export.xlsx')).status,404);
 }
 assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM lots').get().n,0);assert.equal(h.externalCalls(),0);
});
test('schema4→5 마이그레이션은 기존 OZD 원본을 보존하고 새 변환표 저장소만 추가',async t=>{
 const h=await harness(t),b=await(await h.upload()).json();const old=h.db.prepare('SELECT sha256,bytes FROM import_documents WHERE batch_id=?').get(b.id);h.db.exec('DROP TABLE import_document_exports; PRAGMA user_version=4;');migrateEnhancements(h.db);assert.equal(h.db.prepare('PRAGMA user_version').get().user_version,6);const after=h.db.prepare('SELECT sha256,bytes FROM import_documents WHERE batch_id=?').get(b.id);assert.deepEqual(after,old);
});
