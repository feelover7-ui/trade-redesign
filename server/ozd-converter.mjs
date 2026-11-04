import {createHash} from 'node:crypto';
export const MAX_DOCUMENT_BYTES=8*1024*1024;
export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(message,code,status=422)=>Object.assign(new Error(message),{code,status});
export function assertOzd(bytes){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
 if(bytes.length<16||bytes.length>MAX_DOCUMENT_BYTES||bytes.subarray(0,3).toString('ascii')!=='OZP')throw fail('OZP 형식의 OZD 원본인지 확인하세요. 확장자만 변경한 파일은 가져오지 않습니다.','INVALID_OZD',400);
}
function bridgeUrl(env){
 try{
  const u=new URL(env.OZD_BRIDGE_URL||'');
  if(u.username||u.password||u.hash||u.search||!['https:','http:'].includes(u.protocol))return null;
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  const octets=u.hostname.split('.').map(Number);const privateIPv4=octets.length===4&&octets.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(octets[0]===10||(octets[0]===172&&octets[1]>=16&&octets[1]<=31)||(octets[0]===192&&octets[1]===168)||(octets[0]===100&&octets[1]>=64&&octets[1]<=127));
  if(u.protocol==='http:'&&!local&&(env.OZD_ALLOW_PRIVATE_HTTP!=='true'||!privateIPv4))return null;
  if(!u.pathname.endsWith('/convert'))return null;
  return u;
 }catch{return null;}
}
export function ozdStatus(env=process.env){
 const enabled=env.OZD_BRIDGE_ENABLED==='true',approved=env.OZD_BRIDGE_APPROVED==='true';
 const configured=enabled&&approved&&!!bridgeUrl(env)&&String(env.OZD_BRIDGE_TOKEN||'').length>=32;
 return {configured,mode:configured?'BRIDGE_CONFIGURED':'CONVERTER_REQUIRED',message:configured?'변환 연결 설정됨 · 실제 OZD 변환은 업로드 시 확인합니다.':'OZD 자동 해석은 승인된 OZ 변환기 연결이 필요합니다. 원본을 보관한 뒤 변환 엑셀을 연결할 수도 있습니다.'};
}
/** Reports real conversion engine readiness; a configured URL is not a working OZ engine. */
export async function probeOzdBridge({env=process.env,fetcher=fetch}={}){
 const base=ozdStatus(env);
 if(!base.configured)return {...base,ready:false};
 try{
  const url=bridgeUrl(env);url.pathname='/health';
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+env.OZD_BRIDGE_TOKEN,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(3000)});
  if(!response.ok){await response.body?.cancel();return {...base,ready:false,message:'OZD 변환기 인증 또는 상태 확인에 실패했습니다. 기존 원본은 보존됩니다.'};}
  // Health is an untrusted private HTTP response too. Bound bytes before reading
  // the whole body, and never reflect arbitrary engine text or authentication.
  if(Number(response.headers.get('content-length'))>2048){await response.body?.cancel();throw Error('health response too large');}
  const reader=response.body?.getReader();if(!reader)throw Error('empty health response');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw Error('health response too large');}chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const knownTypes=new Set(['OZ_HTML5','EXTERNAL_EXECUTABLE','OZ_RUNTIME']);
  const engineType=data.engineType===undefined?'OZ_RUNTIME':knownTypes.has(data.engineType)?data.engineType:'';
  const ready=data.ok===true&&data.engineConfigured===true&&!!engineType;
  return {...base,ready,engineType:ready?engineType:'',message:ready?'OZD 변환 엔진이 연결돼 있습니다. 실제 파일 변환은 업로드 시 검증합니다.':'OZD 브릿지는 응답하지만 OZ Viewer 변환 엔진·라이선스 설정이 완료되지 않았습니다.'};
 }catch{return {...base,ready:false,message:'OZD 변환기 상태를 확인할 수 없습니다. 원본 보관·변환 대기로 진행합니다.'};}
}

/** Our private bridge contract, NOT a public OZ/FORCS or procurement API. */
export async function convertOzd(bytes,{env=process.env,fetcher=fetch}={}){
 assertOzd(bytes);if(!ozdStatus(env).configured)throw fail('OZD 변환기가 아직 연결되지 않았습니다. 원본은 보관하고 변환기 설정 또는 변환 엑셀 연결 후 계속할 수 있습니다.','OZD_CONVERTER_REQUIRED',503);
 const inputHash=sha256(bytes),value=Number(env.OZD_BRIDGE_TIMEOUT_MS),timeout=Number.isFinite(value)&&value>0?Math.min(90000,Math.max(1000,value)):60000;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);let reader;
 try{
  const r=await fetcher(bridgeUrl(env),{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${env.OZD_BRIDGE_TOKEN}`,'Content-Type':'application/octet-stream','X-Source-SHA256':inputHash,Accept:XLSX_MIME},body:bytes});
  if(!r.ok){await r.body?.cancel();throw fail(r.status===401||r.status===403?'OZD 변환기 인증 설정을 확인하세요.':r.status===503?'OZD 변환 엔진이 준비되지 않았습니다.':r.status===429?'변환기가 다른 문서를 처리 중입니다. 잠시 후 다시 시도하세요.':'OZD 변환에 실패했습니다. 원본 보관 상태에서 다시 시도할 수 있습니다.','OZD_CONVERSION_FAILED',502);}
  if(r.headers.get('x-source-sha256')!==inputHash){await r.body?.cancel();throw fail('원본과 변환 결과의 연결 확인에 실패했습니다.','OZD_SOURCE_MISMATCH');}
  if((r.headers.get('content-type')||'').split(';')[0]!==XLSX_MIME){await r.body?.cancel();throw fail('변환기가 XLSX를 반환하지 않았습니다.','OZD_OUTPUT_INVALID');}
  if(Number(r.headers.get('content-length'))>MAX_DOCUMENT_BYTES){await r.body?.cancel();throw fail('변환 결과가 8MB를 초과했습니다.','OZD_OUTPUT_TOO_LARGE');}
  reader=r.body?.getReader();if(!reader)throw fail('변환 결과가 비어 있습니다.','OZD_OUTPUT_INVALID');
  let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_DOCUMENT_BYTES){await reader.cancel();throw fail('변환 결과가 8MB를 초과했습니다.','OZD_OUTPUT_TOO_LARGE');}chunks.push(Buffer.from(value));}
  const output=Buffer.concat(chunks);if(output.length<8||output.subarray(0,2).toString()!=='PK')throw fail('변환 결과가 실제 XLSX 형식이 아닙니다.','OZD_OUTPUT_INVALID');
  return {bytes:output,inputHash,outputHash:sha256(output),method:'APPROVED_OZ_BRIDGE'};
 }catch(e){if(e.code?.startsWith('OZD_'))throw e;throw fail('OZD 변환기 연결이 지연되거나 실패했습니다. 서버 연결·엔진 상태를 확인하세요.','OZD_BRIDGE_UNAVAILABLE',502);}
 finally{clearTimeout(timer);reader?.releaseLock();}
}
