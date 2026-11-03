import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {must} from './db.mjs';
const parser=new XMLParser({ignoreAttributes:true,removeNSPrefix:true,parseTagValue:false,processEntities:false});
const rejected=(message,code,status=502)=>Object.assign(new Error(message),{code,status});
function transportError(error){return /TimeoutError|AbortError/.test(error?.name)?rejected('조달청 응답 시간이 초과되었습니다. 잠시 후 다시 조회하거나 직접 입력하세요.','CATALOG_TIMEOUT',504):rejected('조달청 연결에 실패했습니다. 서버 연결을 확인하거나 직접 입력하세요.','CATALOG_UNAVAILABLE');}
export function checkCatalogCode(value){
 const code=String(value??'');
 if(['20','21','30','31','32'].includes(code))throw rejected('조달청 인증/활용신청 오류입니다. 키·이용승인·사용 기간을 서버에서 확인하세요.','CATALOG_AUTH');
 if(['22','LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR'].includes(code))throw rejected('조달청 제공기관의 사용량 제한입니다. 잠시 후 다시 조회하거나 저장된 결과를 이용하세요.','CATALOG_RATE_LIMIT',429);
}
/** Never return provider bodies or request URLs: they can echo service keys. */
export async function readCatalogResponse(url,fetcher=fetch){
 let response;try{response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json, application/xml'}});}catch(e){throw transportError(e);}
 if([401,403].includes(response.status))throw rejected('조달청 인증/활용신청이 거부되었습니다. 키와 해당 서비스의 이용승인을 확인하세요.','CATALOG_AUTH');
 if(response.status===429)throw rejected('조달청 제공기관의 사용량 제한입니다. 잠시 후 다시 조회하세요.','CATALOG_RATE_LIMIT',429);
 must(response.ok,`조달청 응답 오류 (HTTP ${response.status}). 서버 연결을 확인하세요.`,502,'CATALOG_HTTP');
 const reader=response.body?.getReader();must(reader,'조달청 응답이 비었습니다.',502);let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024*1024){await reader.cancel();throw rejected('조달청 응답이 제한 크기를 넘었습니다.','CATALOG_SIZE');}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}catch(e){if(e.code==='CATALOG_SIZE')throw e;throw transportError(e);}finally{reader.releaseLock();}
 let parsed;try{parsed=JSON.parse(text);}catch{}
 if(parsed&&typeof parsed==='object'){checkCatalogCode(parsed.response?.header?.resultCode);return parsed;}
 must(!/<!DOCTYPE|<!ENTITY/i.test(text)&&XMLValidator.validate(text)===true,'조달청 응답 형식을 확인할 수 없습니다.',502,'CATALOG_FORMAT');
 const obj=parser.parse(text);
 if(obj.OpenAPI_ServiceResponse){checkCatalogCode(obj.OpenAPI_ServiceResponse.cmmMsgHeader?.returnReasonCode);throw rejected('조달청 인증/활용신청 오류입니다. 키와 사용 기간을 서버에서 확인하세요.','CATALOG_AUTH');}
 if(obj.html)throw rejected('조달청 인증/활용신청 오류입니다. 키와 사용 기간을 서버에서 확인하세요.','CATALOG_AUTH');
 must(obj.response?.header,'조달청 응답 구조가 예상과 다릅니다.',502,'CATALOG_FORMAT');checkCatalogCode(obj.response.header.resultCode);return obj;
}
