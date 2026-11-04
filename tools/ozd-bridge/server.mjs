/** Private conversion bridge. Supply your licensed, verified OZ export adapter.
 * No engine, command-line flags, credentials, or sample success response are invented here.
 */
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {mkdtemp,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {assertOzd,MAX_DOCUMENT_BYTES,XLSX_MIME,sha256} from '../../server/ozd-converter.mjs';

function settings(env){
 let args=[];try{args=JSON.parse(env.OZD_CONVERTER_ARGS_JSON||'[]');}catch{}
 const executable=env.OZD_CONVERTER_EXECUTABLE||'';
 const ready=env.OZD_ENGINE_APPROVED==='true'&&isAbsolute(executable)&&existsSync(executable)&&Array.isArray(args)&&args.every(a=>typeof a==='string'&&a.length<4096)&&args.some(a=>a.includes('{input}'))&&args.some(a=>a.includes('{output}'));
 return {executable,args,ready,timeout:Number.isFinite(Number(env.OZD_ENGINE_TIMEOUT_MS))&&Number(env.OZD_ENGINE_TIMEOUT_MS)>0?Math.min(75000,Math.max(1000,Number(env.OZD_ENGINE_TIMEOUT_MS))):45000};
}
async function execute(config,input,output,jobDir){
 const args=config.args.map(a=>a.replaceAll('{input}',input).replaceAll('{output}',output));
 // Only the configured executable, never shell text or client-supplied arguments.
 const safeEnv={};for(const key of ['PATH','Path','HOME','USERPROFILE','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','PROGRAMDATA','APPDATA','LOCALAPPDATA','OZ_LICENSE_FILE'])if(process.env[key])safeEnv[key]=process.env[key];
 await new Promise((resolve,reject)=>{
  const child=spawn(config.executable,args,{shell:false,cwd:jobDir,windowsHide:true,detached:process.platform!=='win32',stdio:'ignore',env:safeEnv});
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;if(process.platform==='win32'){const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,shell:false});killer.on('error',()=>child.kill('SIGKILL'));}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}},config.timeout);
  child.once('error',()=>{clearTimeout(timer);reject(new Error('CONVERTER_START_FAILED'));});
  child.once('close',code=>{clearTimeout(timer);code===0&&!timedOut?resolve():reject(new Error(timedOut?'CONVERTER_TIMEOUT':'CONVERTER_FAILED'));});
 });
}
export function createOzdBridge({env=process.env,runner=execute}={}){
 const token=String(env.OZD_BRIDGE_TOKEN||'');if(token.length<32)throw new Error('Set a separate OZD_BRIDGE_TOKEN of at least 32 characters.');
 const config=settings(env);let active=false;
 const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const server=createServer(async(req,res)=>{
  if(req.headers.origin||!equal(String(req.headers.authorization||''),'Bearer '+token)){req.resume();return json(res,401,{error:'UNAUTHORIZED'});}
  if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,engineConfigured:config.ready,contract:'trade-ozd-xlsx-v1'});
  if(req.method!=='POST'||req.url!=='/convert'){req.resume();return json(res,404,{error:'NOT_FOUND'});}
  if(!config.ready){req.resume();return json(res,503,{error:'ENGINE_NOT_CONFIGURED'});}
  if(active){req.resume();return json(res,429,{error:'BUSY'});}
  if(req.headers['content-type']!=='application/octet-stream'||Number(req.headers['content-length'])>MAX_DOCUMENT_BYTES){req.resume();return json(res,413,{error:'INVALID_INPUT'});}
  active=true;let jobDir;
  try{
   const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>MAX_DOCUMENT_BYTES){json(res,413,{error:'TOO_LARGE'});return;}parts.push(part);}
   const input=Buffer.concat(parts);assertOzd(input);const inputHash=sha256(input);if(req.headers['x-source-sha256']!==inputHash)return json(res,400,{error:'SOURCE_MISMATCH'});
   jobDir=await mkdtemp(join(tmpdir(),'trade-ozd-'));const inputPath=join(jobDir,'source.ozd'),output=join(jobDir,'converted.xlsx');await writeFile(inputPath,input,{flag:'wx',mode:0o600});
   await runner(config,inputPath,output,jobDir);const stat=await lstat(output);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_DOCUMENT_BYTES)throw new Error('OUTPUT_INVALID');const bytes=await readFile(output);if(bytes.subarray(0,2).toString()!=='PK')throw new Error('OUTPUT_INVALID');
   res.writeHead(200,{'Content-Type':XLSX_MIME,'Content-Length':bytes.length,'X-Source-SHA256':inputHash,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
  }catch{if(!res.headersSent)json(res,422,{error:'CONVERSION_FAILED'});else res.end();}
  finally{if(jobDir)await rm(jobDir,{recursive:true,force:true}).catch(()=>{});active=false;}
 });
 server.headersTimeout=10000;server.requestTimeout=90000;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const host=process.env.OZD_BRIDGE_HOST||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&process.env.OZD_PRIVATE_NETWORK_APPROVED!=='true')throw new Error('Remote binding requires a protected private network and OZD_PRIVATE_NETWORK_APPROVED=true.');
 const port=Number(process.env.OZD_BRIDGE_PORT||4318);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid bridge port.');
 const server=createOzdBridge().listen(port,host,()=>console.log(`Private OZD bridge listening on ${host}:${port}; engine readiness requires authenticated /health.`));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
