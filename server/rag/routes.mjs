import {resolve} from 'node:path';
import {mkdirSync,readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {business} from '../service.mjs';
import {KnowledgeBase} from './search.mjs';
import {ragConfig,ready,generateGrounded} from './deepseek.mjs';
const questionSchema=z.object({question:z.string().trim().min(2).max(1000),scope:z.enum(['all','app','library']).default('all'),generate:z.boolean().default(false),consent:z.boolean().default(false),history:z.array(z.string().max(1000)).max(4).default([])}).strict();
const hash=x=>createHash('sha256').update(x).digest('hex');
export function mountRag(app,{dataDir,env=process.env,fetcher=fetch,knowledge}={}){
 const config=ragConfig(env),kb=knowledge||new KnowledgeBase({dir:env.RAG_CORPUS_DIR,libraryEnabled:env.RAG_LIBRARY_ENABLED==='true'});
 let usage=null;const active=new Set();const windows=new Map();
 function budget(user){const day=new Date().toISOString().slice(0,10);if(!usage){mkdirSync(dataDir,{recursive:true,mode:0o700});usage=new DatabaseSync(resolve(dataDir,'rag-usage.sqlite'));usage.exec('CREATE TABLE IF NOT EXISTS usage(org TEXT NOT NULL,day TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(org,day)); PRAGMA busy_timeout=5000;');}usage.exec('BEGIN IMMEDIATE');try{const n=usage.prepare('SELECT n FROM usage WHERE org=? AND day=?').get(user.org_id,day)?.n||0;if(n>=config.dailyLimit)throw new Error('기관의 오늘 AI 호출 한도에 도달했습니다. 검색만 이용하세요.');usage.prepare('INSERT INTO usage VALUES(?,?,1) ON CONFLICT(org,day) DO UPDATE SET n=n+1').run(user.org_id,day);usage.exec('COMMIT');}catch(e){usage.exec('ROLLBACK');throw e;}}
 app.locals.closeRag=()=>{kb.close();usage?.close();};
 const gate=(req,res,next)=>{try{business(req.user);next();}catch(e){next(e);}};
 app.get('/api/rag/status',gate,(req,res)=>res.json({...kb.stats(),aiConfigured:ready(config),provider:config.provider,model:config.model,libraryExternalApproved:config.libraryExternalApproved,historyStorage:'화면 메모리만; 서버 대화본문 저장 안함'}));
 app.post('/api/rag/ask',gate,async(req,res)=>{
  const d=questionSchema.parse(req.body),user=req.user;const now=Date.now(),last=windows.get(user.id);if(last&&now-last.start<60000&&last.n>=30)return res.status(429).json({error:'잠시 후 다시 검색하세요.'});if(windows.size>10000)for(const[k,v]of windows)if(now-v.start>60000)windows.delete(k);windows.set(user.id,last&&now-last.start<60000?{start:last.start,n:last.n+1}:{start:now,n:1});
  const contextual=d.history.length&&(/그|이것|양식|서식|그럼|다음/.test(d.question)||d.question.length<14)?d.history.slice(-1).join(' ')+' '+d.question:d.question;
  let sources=kb.search(contextual,{scope:d.scope,limit:8});
  const warnings=['지침은 제공판·현행성 미검증입니다. 금액·기간·예외는 원문과 현행 규정으로 확인하세요.','AI 답변은 행정 결재·법률 판단·대장 변경을 수행하지 않습니다.'];
  const base={requestId:randomUUID(),queryHash:hash(d.question),sections:[],sources:[],mode:'SEARCH_ONLY',model:null,warnings,needsReview:true};
  const label=items=>items.map((s,i)=>({...s,label:'S'+(i+1)}));
  if(!sources.length)return res.json({...base,mode:'NO_EVIDENCE',message:d.scope==='library'&&!kb.stats().libraryDocuments?'지침 자료는 현재 제공되지 않습니다. 물품 등록·신청·인계·배송 등 프로그램 사용법을 질문해 주세요.':'해당 질문에 답할 근거를 찾지 못했습니다. 물품 등록·신청·인계·배송 등 업무 내용을 구체적으로 입력해 주세요.'});
  if(!d.generate)return res.json({...base,sources:label(sources),message:'질문과 관련된 자료입니다.'});
  if(!d.consent)return res.status(400).json({error:'질문과 검색 근거를 딥시크에 보내는 데 동의해야 합니다.'});
  if(!ready(config))return res.json({...base,sources:label(sources),message:'딥시크 연결 또는 외부전송 승인이 없어 검색 근거만 표시합니다.'});
  if(!config.libraryExternalApproved&&sources.some(s=>s.source==='LIBRARY'))return res.json({...base,sources:label(sources),message:'지침 자료의 외부 전송 승인이 없어 AI 호출 없이 근거만 표시합니다. 프로그램 사용법은 프로그램 범위로 질문하세요.'});
  sources=sources.slice(0,6);if(active.has(user.id))return res.status(429).json({error:'이전 AI 답변이 처리 중입니다.'});active.add(user.id);
  try{budget(user);const answer=await generateGrounded({question:d.question,history:d.history,sources,config,fetcher});res.json({...base,...answer,sources:label(sources),mode:answer.sections.length?'GENERATED':'NO_EVIDENCE',message:answer.sections.length?'검색 근거를 사용한 딥시크 답변입니다. 출처 연결을 검증했으며 문장 의미의 완전한 정확성을 보장하지는 않습니다.':'제공된 근거만으로 답을 확정할 수 없습니다.'});}
  catch(e){res.json({...base,mode:'PROVIDER_ERROR',sources:label(sources),message:e.message||'AI 호출에 실패했습니다. 검색 근거는 유지됩니다.'});}finally{active.delete(user.id);}
 });
 app.get('/api/rag/chunks/:id',gate,(req,res)=>{const s=kb.chunk(req.params.id);if(!s)return res.status(404).json({error:'원문 구절을 찾을 수 없거나 접근할 수 없습니다.'});res.json(s);});
 app.get('/api/rag/documents/:id/original',gate,(req,res)=>{const d=kb.document(req.params.id);if(!d?.original)return res.status(404).json({error:'이 원본 파일은 연결되지 않았습니다. 파일을 만들어 제공한 것으로 처리하지 않습니다.'});const bytes=readFileSync(d.original);if(hash(bytes)!==d.sha256)return res.status(409).json({error:'원본 파일 무결성 검증에 실패했습니다.'});res.type('application/octet-stream').set('Content-Disposition',`attachment; filename="${d.id}.bin"; filename*=UTF-8''${encodeURIComponent(d.original_name.replace(/[\r\n]/g,''))}`).send(bytes);});
 return kb;
}
