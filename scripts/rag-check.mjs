import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {KnowledgeBase} from '../server/rag/search.mjs';
import {DEEPSEEK_BASE,ragConfig,ready,boundedJson,generateGrounded} from '../server/rag/deepseek.mjs';
const env=process.env,config=ragConfig(env);
const kb=new KnowledgeBase({dir:env.RAG_CORPUS_DIR,libraryEnabled:env.RAG_LIBRARY_ENABLED==='true'});
try{
 const status=kb.stats();console.log(JSON.stringify({...status,model:config.model,aiConfigured:ready(config)},null,2));
 if(env.RAG_LIBRARY_ENABLED==='true'){
  if(!status.libraryDocuments)throw new Error('지침 사용을 켰지만 읽을 수 있는 인덱스가 없습니다.');
  const manifestFile=resolve(env.RAG_CORPUS_DIR,'manifest.json');if(!existsSync(manifestFile))throw new Error('자료 manifest.json이 없습니다.');
  const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));
  const hash=createHash('sha256').update(readFileSync(resolve(env.RAG_CORPUS_DIR,'index.sqlite'))).digest('hex');
  if(hash!==manifest.indexSha256)throw new Error('지침 인덱스 해시가 manifest와 다릅니다.');
  if(manifest.documents!==status.libraryDocuments||manifest.chunks!==status.libraryChunks)throw new Error('인덱스 문서·구간 수가 manifest와 다릅니다.');
  console.log('Private index checksum and counts: OK');
 }
 for(const [q,scope]of [['엑셀로 물품 등록','app'],['소요조회 15일 권장','library'],['관리전환 합의서 서식','library']])console.log(JSON.stringify({q,scope,results:kb.search(q,{scope,limit:3}).map(x=>({documentId:x.documentId,locator:x.locator,currentness:x.currentness}))}));
 if(process.argv.includes('--live')){
  if(!ready(config))throw new Error('실호출에는 RAG_AI_ENABLED/RAG_EXTERNAL_APPROVED와 DEEPSEEK_API_KEY가 필요합니다.');
  const models=await boundedJson(DEEPSEEK_BASE+'/models',{headers:{Authorization:`Bearer ${config.key}`}});
  const found=models.data?.find(m=>m.id===config.model);if(!found)throw new Error('설정한 RAG_MODEL이 계정의 모델 목록에 없습니다. 자동 대체하지 않습니다.');
  console.log(JSON.stringify({modelId:found.id,displayName:found.name||null}));
  const answer=await generateGrounded({question:'엑셀로 물품을 어떻게 등록하나요?',sources:kb.search('엑셀 물품 등록',{scope:'app',limit:3}),config});
  if(!answer.sections.length)throw new Error('실호출은 응답했지만 인용 답변을 생성하지 못했습니다.');
  console.log(JSON.stringify({liveModel:answer.model,sections:answer.sections.length,usage:answer.usage,note:'공개 프로그램 안내만 전송. private 지침은 전송하지 않음.'},null,2));
 }
}catch(e){console.error('RAG_CHECK_FAILED:',e.message);process.exitCode=1;}finally{kb.close();}
