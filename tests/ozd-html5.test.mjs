import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {html5Status,exportHtml5} from '../tools/ozd-bridge/html5-converter.mjs';
import {createOzdBridge} from '../tools/ozd-bridge/server.mjs';

test('공식 OZ HTML5 모드: 라이선스·실제 뷰어 JS·브라우저 없으면 변환 불가',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'trade-ozd-html5-unit-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const assets=join(dir,'vendor');mkdirSync(assets);writeFileSync(join(assets,'OZJSViewer.js'),'/* Synthetic test placeholder, NOT a real OZ SDK. */');
 const env={OZD_ENGINE_KIND:'OZ_HTML5',OZD_ENGINE_APPROVED:'true',OZD_HTML5_LICENSE_CONFIRMED:'true',OZD_HTML5_ASSET_DIR:assets,OZD_HTML5_BROWSER_PATH:process.execPath};
 assert.equal(html5Status(env).ready,true);
 assert.equal(html5Status({...env,OZD_HTML5_LICENSE_CONFIRMED:'false'}).ready,false);
 assert.equal(html5Status({...env,OZD_HTML5_ASSET_DIR:join(dir,'missing')}).ready,false);
 assert.equal(html5Status({...env,OZD_HTML5_SCRIPTS_JSON:'["../outside.js"]'}).ready,false);
 assert.equal(html5Status({...env,OZD_HTML5_BROWSER_PATH:join(dir,'missing')}).ready,false);
 const token='NOT_REAL_BRIDGE_TOKEN_AT_LEAST_32_CHARS';
 const server=createOzdBridge({env:{OZD_BRIDGE_TOKEN:token,...env,OZD_HTML5_LICENSE_CONFIRMED:'false'}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(()=>new Promise(ok=>server.close(ok)));
 const url='http://127.0.0.1:'+server.address().port;
 const r=await fetch(url+'/health',{headers:{Authorization:'Bearer '+token}});
 assert.equal(r.status,200);
 const info=await r.json();assert.equal(info.engineConfigured,false);assert.equal(info.engineType,'OZ_HTML5');
 const denied=await fetch(url+'/convert',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},body:Buffer.from('OZP\x00synthetic input')});
 assert.equal(denied.status,503);
});

test('등록 화면은 URL 설정과 실제 OZ 엔진 준비 여부를 구분하며 키는 브라우저에 노출하지 않음',async()=>{
 const {probeOzdBridge}=await import('../server/ozd-converter.mjs');
 const env={OZD_BRIDGE_ENABLED:'true',OZD_BRIDGE_APPROVED:'true',OZD_BRIDGE_URL:'http://127.0.0.1:4318/convert',OZD_BRIDGE_TOKEN:'SYNTHETIC-BRIDGE-TOKEN-1234567890123456'};
 let calls=0;
 const unavailable=await probeOzdBridge({env:{...env,OZD_BRIDGE_APPROVED:'false'},fetcher:()=>{calls++;throw Error('must not call');}});
 assert.equal(unavailable.ready,false);assert.equal(calls,0);
 const notReady=await probeOzdBridge({env,fetcher:async(url,request)=>{calls++;assert.equal(url.pathname,'/health');assert.equal(request.headers.Authorization,'Bearer '+env.OZD_BRIDGE_TOKEN);return new Response(JSON.stringify({ok:true,engineConfigured:false}));}});
 assert.equal(notReady.configured,true);assert.equal(notReady.ready,false);assert(!JSON.stringify(notReady).includes(env.OZD_BRIDGE_TOKEN));
 const ready=await probeOzdBridge({env,fetcher:async()=>new Response(JSON.stringify({ok:true,engineConfigured:true,engineType:'OZ_HTML5'}))});
 assert.equal(ready.ready,true);assert.equal(ready.engineType,'OZ_HTML5');
 const error=await probeOzdBridge({env,fetcher:async()=>{throw Error('secret'+env.OZD_BRIDGE_TOKEN);}});
 assert.equal(error.ready,false);assert(!JSON.stringify(error).includes(env.OZD_BRIDGE_TOKEN));
});

test('브릿지 health는 엔진문자열에 반사된 비밀값을 전달하지 않음',async()=>{
 const {probeOzdBridge}=await import('../server/ozd-converter.mjs');
 const env={OZD_BRIDGE_ENABLED:'true',OZD_BRIDGE_APPROVED:'true',OZD_BRIDGE_URL:'http://127.0.0.1:4318/convert',OZD_BRIDGE_TOKEN:'SYNTHETIC-TOKEN-NOT-REAL-1234567890123456'};
 for(const engineType of [env.OZD_BRIDGE_TOKEN,'UNRECOGNIZED_ENGINE']){
  const result=await probeOzdBridge({env,fetcher:async()=>Response.json({ok:true,engineConfigured:true,engineType})});assert.equal(result.ready,false);assert.equal(result.engineType,'');assert.ok(!JSON.stringify(result).includes(env.OZD_BRIDGE_TOKEN));
 }
});

test('브릿지 health는 큰 Content-Length와 제한초과 스트림을 즉시 취소',async()=>{
 const {probeOzdBridge}=await import('../server/ozd-converter.mjs');
 const env={OZD_BRIDGE_ENABLED:'true',OZD_BRIDGE_APPROVED:'true',OZD_BRIDGE_URL:'http://127.0.0.1:4318/convert',OZD_BRIDGE_TOKEN:'SYNTHETIC-TOKEN-NOT-REAL-1234567890123456'};
 for(const headers of [{},{'Content-Length':'2049'}]){
  let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(2049));},cancel(){cancelled=true;}});
  const result=await probeOzdBridge({env,fetcher:async()=>new Response(stream,{headers})});assert.equal(result.ready,false);assert.equal(cancelled,true);
 }
});
