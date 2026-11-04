import {useEffect,useRef,useState} from 'react';
import {ArrowUp,BookOpen,Check,ChevronDown,Copy,MessageCircle,Plus,Search,SlidersHorizontal,Square,Sparkles} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {cleanAnswerText} from '../../shared/chat-text.mjs';
import {api} from '../api';
import {useResource} from '../context';
import {Notice,Loading,ErrorBox} from '../components/UI';
interface Source{id:string;label:string;documentId:string;title:string;kind:string;currentness:string;dateNote:string;locator:string;lineStart:number;lineEnd:number;text:string;quality:string;source:string;route:string|null;originalName:string;originalAvailable:boolean}
interface Answer{requestId:string;mode:string;message:string;sections:{text:string;sourceIds:string[]}[];sources:Source[];warnings:string[];model:string|null;needsReview:boolean}
interface Status{appDocuments:number;libraryDocuments:number;libraryChunks:number;warning:string;aiConfigured:boolean;model:string;libraryExternalApproved:boolean}
interface Turn{question:string;answer:Answer}
const labels:Record<string,string>={APP:'사용 안내',REFERENCE:'제공판 원문',TEMPLATE:'서식 자료',DESIGN:'설계 참고자료'};
const markdownComponents={a:({children}:{children?:React.ReactNode})=><span>{children}</span>,img:()=>null,table:({children}:{children?:React.ReactNode})=><div className="table-scroll"><table>{children}</table></div>};
function AnswerView({turn,index}:{turn:Turn;index:number}){
 const {answer:a}=turn;const [sourcesOpen,setSourcesOpen]=useState(false),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState('');
 const generated=a.mode==='GENERATED';const text=a.sections.map(s=>cleanAnswerText(s.text)).filter(Boolean).join('\n\n');
 const copy=async()=>{try{await navigator.clipboard.writeText(text||a.message);setCopied(true);setCopyError('');}catch{setCopyError('복사할 내용을 직접 선택해 주세요.');}};
 return <article className="chat-turn rag-turn"><div className="chat-user"><span className="sr-only">내 질문</span><p>{turn.question}</p></div>
 <div className="chat-assistant"><span className="chat-avatar" aria-hidden="true"><Sparkles size={19}/></span><div className="chat-answer rag-answer">
 <div className="chat-answer-label">물품이음 <span>{generated?'AI 업무도우미':a.mode==='NO_EVIDENCE'?'근거 확인 필요':'자료 검색'}</span></div>
 {generated?<div className="chat-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={markdownComponents}>{text}</Markdown></div>:<><p className={a.mode==='PROVIDER_ERROR'?'chat-error':''}>{a.message}</p>{a.mode==='SEARCH_ONLY'&&a.sources[0]?<div className="chat-search-preview"><small>관련 자료 발췌 · AI가 생성한 답변은 아닙니다</small><p>{a.sources[0].text.slice(0,360)}{a.sources[0].text.length>360?'…':''}</p></div>:null}</>}
 <div className="chat-answer-actions">{a.sources.length?<button type="button" className={'chat-source-button '+(sourcesOpen?'selected':'')} aria-expanded={sourcesOpen} aria-controls={'chat-sources-'+index} onClick={()=>setSourcesOpen(v=>!v)}><BookOpen size={15}/>참고자료 {a.sources.length}<ChevronDown size={14} className={sourcesOpen?'rotate':''}/></button>:null}
 {text?<button type="button" className="chat-icon-button" aria-label="답변 복사" title="답변 복사" onClick={()=>void copy()}>{copied?<Check size={16}/>:<Copy size={16}/>}</button>:null}
 <span className="chat-review-label">{generated?'원문·현행 기준 확인 필요':'검색 결과'}</span></div>{copyError?<small role="status">{copyError}</small>:null}
 {sourcesOpen?<div id={'chat-sources-'+index} className="chat-source-panel rag-sources"><div className="chat-panel-heading"><strong>답변에 참고한 자료</strong><button type="button" className="text-button" onClick={()=>setSourcesOpen(false)}>닫기</button></div>
 {a.sources.map((s,i)=><details key={s.id} className="chat-source-item"><summary><span className="source-number">{i+1}</span><span><strong>{s.title}</strong><small>{labels[s.kind]||s.kind} · {s.locator}</small></span><ChevronDown size={15}/></summary><div className="chat-source-content"><p className="fineprint">{s.documentId}{s.kind!=='APP'?` · MD ${s.lineStart}–${s.lineEnd}행`:''} · {s.dateNote}{s.kind!=='APP'?' · 현행성 미검증':''}{s.quality==='OCR'?' · OCR 원문 대조 필요':''}</p><pre>{s.text}</pre><div className="actions">{s.route?<a className="button secondary compact" href={'#'+s.route}>해당 기능 열기</a>:null}{s.originalAvailable?<a className="button secondary compact" href={`/api/rag/documents/${encodeURIComponent(s.documentId)}/original`}>원본 자료 받기</a>:s.source==='LIBRARY'?<small>원본 미연결 · 변환 텍스트 제공</small>:null}</div>{s.originalAvailable?<small>빈 양식·예시·최신 서식 여부를 확인한 뒤 사용하세요.</small>:null}</div></details>)}
 <p className="fineprint">{a.model?'응답 모델: '+a.model+' · ':''}{a.warnings.join(' ')}</p></div>:null}
 </div></div></article>;
}
export default function Assistant(){
 const {data:status,loading,error,reload}=useResource<Status>('/rag/status');const [question,setQuestion]=useState(''),[scope,setScope]=useState('app'),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[pending,setPending]=useState(''),[settings,setSettings]=useState(false);
 const lock=useRef(false),controller=useRef<AbortController|null>(null),composing=useRef(false),end=useRef<HTMLDivElement>(null),textarea=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[turns.length,busy]);
 useEffect(()=>{if(textarea.current){textarea.current.style.height='auto';textarea.current.style.height=Math.min(160,Math.max(54,textarea.current.scrollHeight))+'px';}},[question]);
 const canGenerate=!!status?.aiConfigured&&consent;
 async function ask(generate:boolean){
  if(lock.current||question.trim().length<2)return;lock.current=true;setBusy(true);setProblem('');const q=question.trim();setPending(q);setQuestion('');const abort=new AbortController();controller.current=abort;
  try{const answer=await api<Answer>('/rag/ask',{method:'POST',signal:abort.signal,body:JSON.stringify({question:q,scope,generate,consent,history:turns.slice(-3).map(t=>t.question)})});setTurns(t=>[...t,{question:q,answer}].slice(-20));}
  catch(e){setQuestion(q);setProblem(e instanceof Error&&e.name==='AbortError'?'화면의 응답 대기를 중단했습니다. 이미 시작된 서버 처리는 완료될 수 있습니다.':e instanceof Error?e.message:'요청에 실패했습니다.');}
  finally{controller.current=null;lock.current=false;setPending('');setBusy(false);textarea.current?.focus();}
 }
 const clear=()=>{if(busy)return;setTurns([]);setQuestion('');setProblem('');textarea.current?.focus();};
 return <div className="chat-page"><header className="chat-header"><div className="chat-heading"><MessageCircle size={25}/><div><h1>AI 업무도우미</h1><p>물품 전환 업무와 사용법을 편하게 물어보세요.</p></div></div><div className="chat-header-actions"><button type="button" className="chat-icon-button" aria-label="대화 설정" aria-expanded={settings} onClick={()=>setSettings(x=>!x)}><SlidersHorizontal size={19}/></button><button type="button" className="button secondary compact" disabled={busy||!turns.length} onClick={clear}><Plus size={16}/>새 대화</button></div></header>
 {loading?<Loading/>:error?<ErrorBox message={error} retry={reload}/>:<>
 {settings?<div className="chat-settings"><label>검색 범위<select aria-label="검색 범위" value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="app">프로그램 사용법</option><option value="library">법령·지침·서식</option><option value="all">모두</option></select></label><p>프로그램 안내 {status?.appDocuments}개 · 제공 지침 {status?.libraryDocuments}개</p><p>{status?.aiConfigured?'AI 연결 설정됨 · 응답 결과로 확인':'AI 미연결 · 자료 검색은 이용 가능'}</p>{status?.warning?<p>{status.warning}</p>:null}<small>대화는 화면 메모리에만 보관되며 새로고침·화면 이동 시 사라집니다. 개인정보·비밀번호·API 키는 입력하지 마세요.</small></div>:null}
 <div className="chat-transcript" aria-label="대화 내역" aria-busy={busy}>
 {!turns.length&&!busy?<div className="chat-welcome"><div className="chat-welcome-mark"><Sparkles size={30}/></div><h2>무엇을 도와드릴까요?</h2><p>등록 방법부터 관리전환 절차까지,<br/>필요한 내용을 함께 찾아보세요.</p><div className="chat-starters">{['엑셀로 물품을 어떻게 등록하나요?','다량 물품 상태를 쉽게 입력하려면?','소요조회 15일은 의무인가요?','관리전환 합의서 양식도 찾아줘'].map(q=><button type="button" key={q} onClick={()=>{setQuestion(q);setScope(/소요조회|합의서/.test(q)?'library':'app');textarea.current?.focus();}}>{q}<ArrowUp size={16}/></button>)}</div></div>:null}
 {turns.map((t,i)=><AnswerView turn={t} index={i} key={t.answer.requestId}/>)}
 {busy?<div className="chat-turn"><div className="chat-user"><p>{pending}</p></div><div className="chat-assistant"><span className="chat-avatar"><Sparkles size={19}/></span><div className="chat-thinking" role="status"><span/><span/><span/><small>자료를 확인하고 있습니다</small></div></div></div>:null}<div ref={end}/>
 </div>
 <div className="chat-compose-wrap">{problem?<Notice tone="warning">{problem}</Notice>:null}<form className="chat-composer" onSubmit={e=>{e.preventDefault();if(status?.aiConfigured&&!consent)return;void ask(canGenerate);}}>
 <textarea ref={textarea} aria-label="업무 질문" rows={2} maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="물품이음에 물어보세요" disabled={busy} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!composing.current&&e.keyCode!==229){e.preventDefault();if(!status?.aiConfigured||consent)void ask(canGenerate);}}}/>
 <div className="chat-compose-toolbar"><div className="chat-compose-meta"><button type="button" className="chat-scope" onClick={()=>setSettings(v=>!v)}>{scope==='app'?'사용법':scope==='library'?'지침·서식':'모두'}<ChevronDown size={13}/></button><span>{status?.aiConfigured?'AI 답변':'자료 검색 모드'}</span></div><div className="chat-compose-actions"><button type="button" className="chat-icon-button" aria-label="근거 검색" title="AI 호출 없이 자료 검색" disabled={busy||question.trim().length<2} onClick={()=>void ask(false)}><Search size={18}/></button>{busy?<button type="button" className="chat-send" aria-label="응답 대기 중단" onClick={()=>controller.current?.abort()}><Square size={16}/></button>:<button type="submit" className="chat-send" aria-label={status?.aiConfigured?'AI 답변 받기':'질문 보내기'} disabled={question.trim().length<2||(!!status?.aiConfigured&&!consent)}><ArrowUp size={21}/></button>}</div></div>
 </form>
 {status?.aiConfigured?<label className="chat-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>질문·이전 질문·검색 근거를 설정된 AI로 보내는 데 동의합니다.</label>:<p className="chat-footnote">AI 미연결 상태에서는 답변 생성 없이 자료를 찾아드립니다.</p>}
 {scope!=='app'&&!status?.libraryExternalApproved?<p className="chat-footnote">지침 외부전송 미승인 상태에서는 지침 검색만 제공합니다.</p>:null}<p className="chat-footnote">안내는 행정 승인이나 대장 변경을 대신하지 않습니다. Enter 전송 · Shift+Enter 줄바꿈</p>
 </div></>}
 </div>;
}
