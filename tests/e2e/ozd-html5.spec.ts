import {test,expect} from '@playwright/test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import * as XLSX from 'xlsx';
import {exportHtml5,html5Status} from '../../tools/ozd-bridge/html5-converter.mjs';
import {createOzdBridge} from '../../tools/ozd-bridge/server.mjs';
import {convertOzd,sha256} from '../../server/ozd-converter.mjs';
const token='SYNTHETIC_BRIDGE_TOKEN_NOT_A_SECRET_0123456789';

function fakeRuntime(root:string,xlsx:Buffer,malformed=false){
 mkdirSync(root);
 // The fake viewer ONLY validates the integration handoff. It is never used in production.
 const js=`window.start_ozjs=function(id){
  const el=document.getElementById(id);
  let source='';
  el.sendToActionScript=function(name,value){if(name==='connection.openfile')source=value;};
  el.ScriptEx=async function(command,options){
    if(command!=='save_memorystream'||!options.includes('export.format=xlsx'))throw Error('Wrong vendor API contract');
    await fetch(source).then(r=>r.arrayBuffer());
    window.OZExportMemoryStreamCallBack_OZViewer(JSON.stringify({'converted.xlsx':'${malformed?'NOT_AN_XLSX':xlsx.toString('base64')}'}));
  };
  setTimeout(()=>{if(window.SetOZParameters_OZViewer())window.OZPostCommand_OZViewer();},50);
 };`;
 writeFileSync(join(root,'OZJSViewer.js'),js);
}
test('OZ HTML5 vendor interface → XLSX export → existing bridge, synthetic licensed SDK double ONLY',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'trade-oz-html5-e2e-'));
 try{
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['G2B목록번호','G2B목록명','등록수량'],['56101703-00001234','합성 책상',3]]),'소요조회');
  const excel=Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));const ozd=Buffer.from('OZP\x03\x00synthetic OZD test source');
  const assetDir=join(dir,'licensed-runtime-fixture'),inputPath=join(dir,'input.ozd'),outputPath=join(dir,'output.xlsx');
  fakeRuntime(assetDir,excel);writeFileSync(inputPath,ozd);
  const env={OZD_ENGINE_KIND:'OZ_HTML5',OZD_ENGINE_APPROVED:'true',OZD_HTML5_LICENSE_CONFIRMED:'true',
    OZD_HTML5_ASSET_DIR:assetDir,OZD_HTML5_BROWSER_PATH:chromium.executablePath(),OZD_HTML5_TIMEOUT_MS:'12000'};
  expect(html5Status(env).ready).toBeTruthy();
  const out=await exportHtml5(inputPath,outputPath,{env});
  expect(out.sha256).toBe(sha256(excel));expect(readFileSync(outputPath).equals(excel)).toBeTruthy();
  const bridge=createOzdBridge({env:{...env,OZD_BRIDGE_TOKEN:token,OZD_ENGINE_TIMEOUT_MS:'25000'}});
  await new Promise(ok=>bridge.listen(0,'127.0.0.1',ok));
  try{
   const url='http://127.0.0.1:'+bridge.address()!.port;
   const status=await fetch(url+'/health',{headers:{Authorization:'Bearer '+token}});
   expect((await status.json()).engineConfigured).toBeTruthy();
   const converted=await convertOzd(ozd,{env:{OZD_BRIDGE_ENABLED:'true',OZD_BRIDGE_APPROVED:'true',OZD_BRIDGE_URL:url+'/convert',OZD_BRIDGE_TOKEN:token}});
   expect(converted.bytes.equals(excel)).toBeTruthy();
  }finally{await new Promise(ok=>bridge.close(ok));}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('잘못된 OZ HTML5 SDK 내보내기는 파일 생성 실패로 처리',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'trade-oz-html5-invalid-'));
 try{
  const assetDir=join(dir,'fake-vendor');fakeRuntime(assetDir,Buffer.from('bad'),true);
  const inputPath=join(dir,'input.ozd');writeFileSync(inputPath,Buffer.from('OZP\x03\x00synthetic untrusted'));
  const env={OZD_ENGINE_APPROVED:'true',OZD_HTML5_LICENSE_CONFIRMED:'true',OZD_HTML5_ASSET_DIR:assetDir,OZD_HTML5_BROWSER_PATH:chromium.executablePath(),OZD_HTML5_TIMEOUT_MS:'3000'};
  await expect(exportHtml5(inputPath,join(dir,'output.xlsx'),{env})).rejects.toThrow();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
