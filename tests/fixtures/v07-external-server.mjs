/** Isolated test-only provider doubles; never imported from production code. */
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as XLSX from 'xlsx';
import {openDatabase} from '../../server/db.mjs';
import {seedDemo} from '../../server/seed.mjs';
import {createApp} from '../../server/app.mjs';
import {XLSX_MIME} from '../../server/ozd-converter.mjs';
export function demandWorkbook(){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['합성 물품 소요조회'],[],['G2B목록번호','G2B목록명','등록수량','취득일자','취득단가','물품상태'],['56101504-00001234','합성 수납장',3,43385,100000,'폐품']]),'소요조회');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
export async function startExternalTestServer(){
 const dir=mkdtempSync(join(tmpdir(),'trade-v07-browser-')),db=openDatabase(join(dir,'trade.sqlite'));await seedDemo(db,dir);
 let app;const server=createServer((req,res)=>app(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;const calls={catalog:0,ozd:0,ai:0};
 const env={PROCUREMENT_ENABLED:'true',DATA_GO_KR_SERVICE_KEY:'SYNTHETIC-NOT-REAL',OZD_BRIDGE_ENABLED:'true',OZD_BRIDGE_APPROVED:'true',OZD_BRIDGE_TOKEN:'SYNTHETIC-BRIDGE-TOKEN-NOT-REAL-32CHARS',OZD_BRIDGE_URL:'http://127.0.0.1:4318/convert',RAG_AI_ENABLED:'true',RAG_EXTERNAL_APPROVED:'true',DEEPSEEK_API_KEY:'SYNTHETIC-NOT-REAL',RAG_MODEL:'deepseek-test-fixture'};
 const fetcher=async(target,options={})=>{const u=new URL(target);
  if(u.hostname==='apis.data.go.kr'){calls.catalog++;return new Response(JSON.stringify({response:{header:{resultCode:'00'},body:{items:[{prdctIdntNo:'00001234',krnPrdctNm:'합성 수납장',mnfctCorpNm:'검증용 제조사',prdctClsfcNoNm:'수납장',useYn:'Y'}]}}}));}
  if(u.pathname==='/convert'){calls.ozd++;return new Response(demandWorkbook(),{headers:{'Content-Type':XLSX_MIME,'X-Source-SHA256':options.headers['X-Source-SHA256']}});}
  if(u.hostname==='api.deepseek.com'){calls.ai++;return new Response(JSON.stringify({model:'deepseek-test-fixture',choices:[{finish_reason:'stop',message:{content:JSON.stringify({sections:[{text:'**파일로 등록하기**\n\n엑셀 또는 OZD 파일을 올리고 품명과 수량을 확인하세요. [S1] 출처 보기\n\n1. 파일을 끌어다 놓습니다.\n2. 원본 정보를 확인합니다.\n3. 조달정보를 보완합니다.',sourceIds:['S1']}],needsReview:true})}}],usage:{prompt_tokens:100,completion_tokens:100}}));}
  throw new Error('Unexpected test external target');
 };
 app=createApp(db,{dataDir:dir,origin:url,demo:true,enhancements:{env,fetcher},rag:{env,fetcher}});
 return {url,calls,db,close:async()=>{app.locals.closeRag?.();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}};
}
