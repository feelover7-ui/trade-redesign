/**
 * FORCS OZ HTML5 Viewer integration.
 * Uses the *documented* start_ozjs / connection.openfile / ScriptEx API.
 * The proprietary vendor runtime and its license MUST be supplied separately.
 * The viewer runs against loopback-only, short-lived OZD bytes. Nothing is
 * served from the public marketplace or sent to a third-party converter.
 */
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,statSync,realpathSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {isAbsolute,resolve,relative,extname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertOzd,MAX_DOCUMENT_BYTES} from '../../server/ozd-converter.mjs';

const allowedAssets=new Map([
 ['.js','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],
 ['.json','application/json'],['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],
 ['.gif','image/gif'],['.svg','image/svg+xml'],['.woff','font/woff'],['.woff2','font/woff2'],
 ['.ttf','font/ttf'],['.wasm','application/wasm']
]);
function list(value,defaults=[]){try{const result=value?JSON.parse(value):defaults;if(!Array.isArray(result)||result.length>24||result.some(s=>typeof s!=='string'||s.length>256||s.startsWith('/')||s.includes('\\')||s.includes('..')||!/^[-a-zA-Z0-9_./]+$/.test(s)))return null;return result;}catch{return null;}}
export function html5Status(env=process.env){
 const root=String(env.OZD_HTML5_ASSET_DIR||''),exe=String(env.OZD_HTML5_BROWSER_PATH||'');
 const scripts=list(env.OZD_HTML5_SCRIPTS_JSON,['OZJSViewer.js']),styles=list(env.OZD_HTML5_STYLES_JSON,[]);
 const scriptsOkay=!!scripts?.length&&scripts.some(s=>basename(s)==='OZJSViewer.js');
 const ready=env.OZD_ENGINE_APPROVED==='true'&&env.OZD_HTML5_LICENSE_CONFIRMED==='true'&&isAbsolute(root)&&isAbsolute(exe)&&scriptsOkay&&!!styles&&
   existsSync(root)&&statSync(root).isDirectory()&&existsSync(exe)&&statSync(exe).isFile()&&
   [...scripts,...styles].every(f=>{try{const p=resolve(root,f),rel=relative(realpathSync(root),realpathSync(p));return rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&statSync(p).isFile();}catch{return false;}});
 return {ready,engineType:'OZ_HTML5',scripts:scripts||[],styles:styles||[],assetRoot:root,browser:exe};
}
const reply=(res,status,data,mime='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end(data);};

function makeHtml(scripts,styles,fileToken,secret){
 // Only fixed, controlled filenames from html5Status. Never insert uploaded data into HTML.
 const css=styles.map(f=>`<link rel="stylesheet" href="/vendor/${f}">`).join('\n');
 const js=scripts.map(f=>`<script src="/vendor/${f}"></script>`).join('\n');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>OZ 비공개 변환</title>${css}</head><body>
 <div id="OZViewer" style="height:900px;width:1100px"></div>
 <script>
 const endpoint='/result/${secret}';
 window.__ozdError='';
 window.__ozdDone=false;
 window.SetOZParameters_OZViewer=function(){
   const el=document.getElementById('OZViewer');
   if(typeof el?.sendToActionScript!=='function'){window.__ozdError='VIEWER_NOT_READY';return false;}
   el.sendToActionScript('viewer.postcommand','true');
   el.sendToActionScript('viewer.errorcommand','true');
   el.sendToActionScript('connection.openfile',new URL('/input/${fileToken}.ozd',location.href).href);
   return true;
 };
 window.OZErrorCommand_OZViewer=function(){window.__ozdError='OZ_RENDER_FAILED';};
 window.OZPostCommand_OZViewer=function(){
  if(window.__ozdDone)return;
  const el=document.getElementById('OZViewer');
  if(typeof el?.ScriptEx!=='function'){window.__ozdError='OZ_EXPORT_INTERFACE_MISSING';return;}
  window.__ozdDone=true;
  el.ScriptEx('save_memorystream','export.format=xlsx;export.filename=converted.xlsx;export.mode=silent;export.confirmsave=false',';');
 };
 window.OZExportMemoryStreamCallBack_OZViewer=async function(payload){
  try{
   const parsed=JSON.parse(payload);
   const rows=Object.entries(parsed).filter(([name,value])=>/\\.xlsx$/i.test(name)&&typeof value==='string');
   if(rows.length!==1)throw Error('Unexpected export result');
   const encoded=rows[0][1];if(encoded.length>12000000)throw Error('Output too large');
   const binary=atob(encoded),result=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)result[i]=binary.charCodeAt(i);
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:result});
   if(!response.ok)throw Error('Result rejected');
  }catch{window.__ozdError='OZ_EXPORT_RESULT_INVALID';}
 };
 </script>${js}
 <script>
  if(typeof start_ozjs!=='function')window.__ozdError='OZ_SDK_NOT_LOADED';
  else try{start_ozjs('OZViewer',location.origin+'/vendor/');}catch{window.__ozdError='OZ_SDK_START_FAILED';}
 </script></body></html>`;
}
/** Executed as a separate child of the private OZD bridge. */
export async function exportHtml5(inputPath,outputPath,{env=process.env,browserType=chromium}={}){
 const cfg=html5Status(env);
 if(!cfg.ready)throw Error('OZ_HTML5_NOT_READY: licensed OZJSViewer.js distribution and browser executable are required');
 const input=await readFile(inputPath);assertOzd(input);
 const rand=randomBytes(18).toString('hex'),secret=randomBytes(18).toString('hex');
 let resultResolve,resultReject;
 const result=new Promise((ok,no)=>{resultResolve=ok;resultReject=no;});
 const localHost='127.0.0.1';
 let settled=false;
 const server=createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url||'/', 'http://127.0.0.1').pathname;
   if(req.headers.host!==`127.0.0.1:${server.address()?.port}`)return reply(res,403,'Forbidden');
   if(req.method==='GET'&&pathname==='/viewer/'+secret){return reply(res,200,makeHtml(cfg.scripts,cfg.styles,rand,secret),'text/html; charset=utf-8');}
   if(req.method==='GET'&&pathname==='/input/'+rand+'.ozd'){return reply(res,200,input,'application/octet-stream');}
   if(req.method==='GET'&&pathname.startsWith('/vendor/')){
    const asset=decodeURIComponent(pathname.slice('/vendor/'.length));
    if(!asset||asset.includes('..')||asset.includes('\\')||asset.startsWith('/')||!/^[-a-zA-Z0-9_./]+$/.test(asset))return reply(res,404,'Not found');
    const type=allowedAssets.get(extname(asset).toLowerCase());if(!type)return reply(res,404,'Not found');
    const full=realpathSync(resolve(cfg.assetRoot,asset)),root=realpathSync(cfg.assetRoot);
    const rel=relative(root,full);
    if(!rel||rel.startsWith('..')||isAbsolute(rel))return reply(res,404,'Not found');
    const bytes=await readFile(full);if(bytes.length>8*1024*1024)return reply(res,413,'Too large');
    return reply(res,200,bytes,type);
   }
   if(req.method==='POST'&&pathname==='/result/'+secret){
    if(settled)return reply(res,409,'Already processed');
    const chunks=[];let count=0;
    for await(const chunk of req){count+=chunk.length;if(count>MAX_DOCUMENT_BYTES)return reply(res,413,'Too large');chunks.push(chunk);}
    const data=Buffer.concat(chunks);
    if(data.length<8||data.subarray(0,2).toString()!=='PK')return reply(res,422,'Invalid XLSX');
    settled=true;resultResolve(data);return reply(res,200,'OK');
   }
   req.resume();return reply(res,404,'Not found');
  }catch{if(!res.headersSent)reply(res,422,'OZ conversion request failed');else res.end();}
 });
 let browser,timer,deadlineTimer;
 try{
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,localHost,yes);});
  const url=`http://127.0.0.1:${server.address().port}/viewer/${secret}`;
  browser=await browserType.launch({executablePath:cfg.browser,headless:true,args:['--no-first-run','--disable-background-networking']});
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname===localHost&&u.port===String(server.address().port))return route.continue();
   return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',()=>{ /* Keep vendor error details out of audit logs. */ });
  const timeout=Math.min(65000,Math.max(5000,Number(env.OZD_HTML5_TIMEOUT_MS)||40000));
  await page.goto(url,{waitUntil:'load',timeout:Math.min(15000,timeout)});
  const deadline=Date.now()+timeout;
  timer=setInterval(async()=>{try{if(page.isClosed())return;const error=await page.evaluate(()=>window.__ozdError);if(error&&!settled){settled=true;resultReject(Error(error));}}catch{}},500);
  const bytes=await Promise.race([result,new Promise((_,reject)=>{deadlineTimer=setTimeout(()=>reject(Error('OZ_HTML5_TIMEOUT')),Math.max(1000,deadline-Date.now()));})]);
  await writeFile(outputPath,bytes,{flag:'wx',mode:0o600});
  return {size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }finally{
  if(timer)clearInterval(timer);
  if(deadlineTimer)clearTimeout(deadlineTimer);
  if(browser)await browser.close().catch(()=>{});
  await new Promise(resolve=>server.close(()=>resolve())).catch(()=>{});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);
 if(!input||!output||!isAbsolute(input)||!isAbsolute(output)){process.stderr.write('Usage: node html5-converter.mjs <absolute_input.ozd> <absolute_output.xlsx>\n');process.exit(2);}
 exportHtml5(input,output).then(()=>process.exit(0)).catch(()=>{process.stderr.write('OZ_HTML5_CONVERSION_FAILED: vendor viewer/package/license/environment check required\n');process.exit(1);});
}
