import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {convertNativeOzd,nativeError} from './native.mjs';
export function convertNativeOzdIsolated(bytes){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL(import.meta.url),{workerData:{bytes},resourceLimits:{maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:32},execArgv:[]});let done=false;
 const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(nativeError('OZD_NATIVE_TIMEOUT','OZD 직접 변환 시간 제한을 넘었습니다. 원본은 보존됩니다.')),12000);
 worker.once('message',message=>message.error?finish(nativeError(message.error.code,message.error.message)):finish(null,{...message.result,bytes:Buffer.from(message.result.bytes)}));
 worker.once('error',()=>finish(nativeError('OZD_NATIVE_INVALID','OZD 직접 변환 중 오류가 발생했습니다. 원본은 보존됩니다.')));
 worker.once('exit',()=>{if(!done)finish(nativeError('OZD_NATIVE_INVALID','OZD 변환 작업이 완료되지 않았습니다.'));});
});}
if(!isMainThread){try{parentPort.postMessage({result:convertNativeOzd(Buffer.from(workerData.bytes))});}catch(e){parentPort.postMessage({error:{code:e.code?.startsWith('OZD_NATIVE_')?e.code:'OZD_NATIVE_INVALID',message:e.code?.startsWith('OZD_NATIVE_')?e.message:'OZD 내부 데이터를 읽지 못했습니다. 원본은 보존됩니다.'}});}}
