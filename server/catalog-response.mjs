import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {must} from './db.mjs';
const parser=new XMLParser({ignoreAttributes:true,removeNSPrefix:true,parseTagValue:false,processEntities:false});
/** Never return provider bodies or request URLs: they can echo service keys. */
export async function readCatalogResponse(url,fetcher=fetch){
 let response;try{response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json, application/xml'}});}catch{throw Object.assign(new Error('조달청 연결 실패 또는 응답 시간 초과입니다.'),{status:502,code:'CATALOG_UNAVAILABLE'});}
 must(response.ok,`조달청 응답 오류 (HTTP ${response.status}). 이용승인·서버 연결을 확인하세요.`,response.status===429?429:502,'CATALOG_HTTP');
 const reader=response.body?.getReader();must(reader,'조달청 응답이 비었습니다.',502);let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024*1024){await reader.cancel();must(false,'조달청 응답이 제한 크기를 넘었습니다.',502);}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 let parsed;try{parsed=JSON.parse(text);}catch{}
 if(parsed&&typeof parsed==='object')return parsed;
 must(!/<!DOCTYPE|<!ENTITY/i.test(text)&&XMLValidator.validate(text)===true,'조달청 응답 형식을 확인할 수 없습니다.',502,'CATALOG_FORMAT');
 const obj=parser.parse(text);
 if(obj.OpenAPI_ServiceResponse||obj.html)must(false,'조달청 인증/활용신청 오류입니다. 키와 사용 기간을 서버에서 확인하세요.',502,'CATALOG_AUTH');
 must(obj.response?.header,'조달청 응답 구조가 예상과 다릅니다.',502,'CATALOG_FORMAT');return obj;
}
