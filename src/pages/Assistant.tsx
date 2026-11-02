import {useEffect,useRef,useState} from 'react';
import {MessageCircle,Search,Send,BookOpen,Trash2} from 'lucide-react';
import {api} from '../api';
import {useResource} from '../context';
import {PageHead,Notice,Field,Loading,ErrorBox} from '../components/UI';
interface Source{id:string;label:string;documentId:string;title:string;kind:string;currentness:string;dateNote:string;locator:string;lineStart:number;lineEnd:number;text:string;quality:string;source:string;route:string|null;originalName:string;originalAvailable:boolean}
interface Answer{requestId:string;mode:string;message:string;sections:{text:string;sourceIds:string[]}[];sources:Source[];warnings:string[];model:string|null;needsReview:boolean}
interface Status{libraryDocuments:number}
interface Turn{question:string;answer:Answer;scope:string;history:string[]}
const labels:Record<string,string>={APP:'프로그램 사용법',REFERENCE:'제공판 원문',TEMPLATE:'서식 포함 원문',DESIGN:'정리·설계 제안 (법령 아님)'};
function AnswerView({turn,index,onRetry,busy}:{turn:Turn;index:number;onRetry?:()=>void;busy:boolean}){
 const {answer:a}=turn;
 const reveal=(label:string)=>{const el=document.getElementById(`rag-${index}-${label}`);el?.setAttribute('open','');el?.scrollIntoView({block:'center',behavior:'smooth'});};
 const title=a.mode==='GENERATED'?'답변':a.mode==='PROVIDER_ERROR'?'답변을 받지 못했습니다':a.mode==='NO_EVIDENCE'?'확인할 자료가 필요합니다':'관련 자료';
 return <article className="rag-turn" id={`rag-turn-${a.requestId}`}>
  <div className="rag-question"><span>내 질문</span><p>{turn.question}</p></div>
  <div className="rag-answer"><h2><BookOpen size={20}/>{title}</h2>
   {a.mode!=='GENERATED'?<p className="subtle" role={a.mode==='PROVIDER_ERROR'?'alert':undefined}>{a.message}</p>:null}
   {onRetry?<button className="button secondary compact" type="button" onClick={onRetry} disabled={busy}>다시 시도</button>:null}
   {a.sections.map((s,i)=><div className="rag-paragraph" key={i}><p>{s.text}</p><div className="actions">{s.sourceIds.map(id=><button type="button" className="text-button" onClick={()=>reveal(id)} key={id}>[{id}] 출처 보기</button>)}</div></div>)}
   <div className="rag-sources">{a.sources.map(s=><details id={`rag-${index}-${s.label}`} key={s.id} open={a.mode!=='GENERATED'&&s.label==='S1'}>
    <summary><strong>[{s.label}] {s.title}</strong><span>{labels[s.kind]||s.kind} · {s.locator}{s.kind!=='APP'?` · MD ${s.lineStart}–${s.lineEnd}행`:''}</span></summary>
    <div className="rag-source-body"><p className="fineprint">{s.dateNote} · {s.kind==='APP'?'현재 제품 안내':'현행성 미검증 / 제공판 참고'}{s.quality==='OCR'?' · 자동 OCR: 원문 대조 필요':''}</p><pre>{s.text}</pre>
     <div className="actions">{s.route?<a className="button secondary compact" href={'#'+s.route}>해당 기능 열기</a>:null}{s.originalAvailable?<a className="button secondary compact" href={`/api/rag/documents/${encodeURIComponent(s.documentId)}/original`}>원본 자료 받기</a>:s.source==='LIBRARY'?<small>원본 파일 미연결 · 변환 텍스트만 제공</small>:null}</div>
     {s.originalAvailable?<small>원본 후보입니다. 빈 양식·작성예시·최신 서식 여부를 확인한 뒤 사용하세요.</small>:null}
    </div>
   </details>)}</div>
  </div>
 </article>;
}
export default function Assistant(){
 const {data:status,loading,error,reload}=useResource<Status>('/rag/status');
 const [question,setQuestion]=useState(''),[scope,setScope]=useState('all'),[busy,setBusy]=useState(false),[pendingQuestion,setPendingQuestion]=useState(''),[problem,setProblem]=useState(''),[turns,setTurns]=useState<Turn[]>([]);
 const lock=useRef(false),libraryAvailable=(status?.libraryDocuments||0)>0;
 useEffect(()=>{const id=busy?'rag-pending':problem?'rag-request-error':turns.length?`rag-turn-${turns[turns.length-1].answer.requestId}`:null;if(id)document.getElementById(id)?.scrollIntoView({block:'start',behavior:'smooth'});},[busy,turns,problem]);
 const prompts=libraryAvailable?['엑셀로 물품을 어떻게 등록하나요?','다량 물품 상태를 쉽게 입력하려면?','소요조회 15일은 의무인가요?','관리전환 합의서 양식도 찾아줘']:['엑셀로 물품을 어떻게 등록하나요?','다량 물품 상태를 쉽게 입력하려면?','받기 신청 후 재고는 언제 예약되나요?','개선사항에 파일은 어떻게 첨부하나요?'];
 // Only explicit submission requests generation; source lookup never calls the provider.
 async function ask(generate:boolean,retry?:{question:string;scope?:string;history?:string[]}){
  const q=(retry?.question??question).trim();if(lock.current||q.length<2)return;
  lock.current=true;setBusy(true);setPendingQuestion(q);setProblem('');
  const requestScope=libraryAvailable?(retry?.scope??scope):'app';
  const history=retry?.history??turns.filter(t=>t.answer.mode==='GENERATED'||t.answer.mode==='SEARCH_ONLY').slice(-3).map(t=>t.question);
  try{
   const answer=await api<Answer>('/rag/ask',{method:'POST',signal:AbortSignal.timeout(65000),body:JSON.stringify({question:q,scope:requestScope,generate,consent:generate,history})});
   setTurns(t=>[...t,{question:q,answer,scope:requestScope,history}].slice(-20));
   if(answer.mode==='GENERATED'||answer.mode==='SEARCH_ONLY')setQuestion(current=>current.trim()===q?'':current);
   else setQuestion(current=>current||q);
  }catch(e){setQuestion(current=>current||q);setProblem(e instanceof Error&&/TimeoutError|AbortError/.test(e.name)?'답변 요청 시간이 길어졌습니다. 다시 시도해 주세요.':e instanceof Error?e.message:'요청에 실패했습니다. 다시 시도해 주세요.');}
  finally{lock.current=false;setBusy(false);setPendingQuestion('');}
 }
 return <div className="rag-page">
  <PageHead title="AI 업무도우미" description="궁금한 내용을 질문하고 답변과 출처를 확인하세요." action={<MessageCircle size={32}/>}/>
  {loading?<Loading/>:error?<ErrorBox message={error} retry={reload}/>:<>
   <div className="rag-prompts">{prompts.map(q=><button className="button secondary compact" type="button" key={q} disabled={busy} onClick={()=>void ask(true,{question:q,scope:/소요조회|합의서/.test(q)?'library':'app'})}>{q}</button>)}</div>
   <div className="rag-transcript" aria-label="대화 내역">{turns.map((t,i)=><AnswerView turn={t} index={i} key={t.answer.requestId} busy={busy} onRetry={i===turns.length-1&&t.answer.mode==='PROVIDER_ERROR'?()=>void ask(true,t):undefined}/>)}{busy?<article className="rag-turn" id="rag-pending"><div className="rag-question"><span>내 질문</span><p>{pendingQuestion}</p></div><p className="rag-answer" role="status">답변을 준비하고 있습니다.</p></article>:!turns.length?<div className="rag-empty"><BookOpen size={30}/><h2>무엇을 도와드릴까요?</h2><p>물품 등록·신청·인계 방법이나 관련 지침을 질문해 주세요.</p></div>:null}</div>
   <form className="rag-composer" onSubmit={e=>{e.preventDefault();void ask(true);}}>
    {libraryAvailable?<Field label="검색 범위"><select value={scope} onChange={e=>setScope(e.target.value)} disabled={busy}><option value="app">프로그램 사용법</option><option value="library">법령·지침·서식 (제공판)</option><option value="all">모두</option></select></Field>:null}
    <Field label="업무 질문"><textarea rows={3} maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();void ask(true);}}} placeholder="예: 물품을 등록하려면 어떻게 하나요?" required disabled={busy}/></Field>
    <div className="actions"><button className="button primary" type="submit" disabled={busy||question.trim().length<2}><Send size={18}/>{busy?'답변을 준비하고 있습니다…':'답변 받기'}</button><button className="button secondary" type="button" disabled={busy||question.trim().length<2} onClick={()=>void ask(false)}><Search size={18}/>자료만 찾기</button><button className="text-button" type="button" disabled={busy||!turns.length} onClick={()=>setTurns([])}><Trash2 size={15}/>대화 비우기</button></div>
    <p className="fineprint">Enter로 전송 · Shift+Enter로 줄바꿈. 대화는 새로고침하면 사라집니다.</p>
    {problem?<div id="rag-request-error"><Notice tone="warning">{problem}</Notice></div>:null}
   </form>
  </>}
 </div>;
}
