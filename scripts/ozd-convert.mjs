/** Local CLI. No external conversion host, browser, SDK, API key or network call. */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {convertNativeOzdIsolated} from '../server/ozd/worker.mjs';
const args=process.argv.slice(2);
if(args.length===1&&['--help','-h'].includes(args[0])){
 console.log('npm run ozd:convert -- input.ozd --output output.xlsx\n기존 파일은 덮어쓰지 않습니다. 비밀번호 없는 에듀파인 소요조회 OZP3 데이터만 지원합니다.\nPC1 algorithm: (c) Alexandre Pukall 1991.');
}else if(args.length!==3||args[1]!=='--output'){
 console.error('사용법: npm run ozd:convert -- input.ozd --output output.xlsx');process.exitCode=2;
}else{
 try{
  const source=resolve(args[0]),target=resolve(args[2]);
  if(extname(source).toLowerCase()!=='.ozd'||extname(target).toLowerCase()!=='.xlsx')throw Error('입력 .ozd / 출력 .xlsx 확장자를 확인하세요.');
  const info=await stat(source);if(!info.isFile()||info.size>8*1024*1024)throw Error('8MB 이하 OZD 파일이어야 합니다.');
  const result=await convertNativeOzdIsolated(await readFile(source));
  await writeFile(target,result.bytes,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({method:result.method,rows:result.summary.rows,totalQuantity:result.summary.totalQuantity,inputSha256:result.inputHash,outputSha256:result.outputHash,output:target,externalCalls:0},null,2));
 }catch(e){console.error(e.code==='EEXIST'?'출력 파일이 이미 있습니다. 새 파일명을 지정하세요. 기존 파일은 보존했습니다.':e.code?.startsWith('OZD_NATIVE_')?`${e.code}: ${e.message}`:'파일 경로·권한 또는 OZD 형식을 확인하세요. 원본과 기존 출력은 변경하지 않았습니다.');process.exitCode=1;}
}
