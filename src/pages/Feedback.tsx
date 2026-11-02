import {useEffect,useRef,useState} from 'react';
import {MessageSquarePlus,Paperclip,Send,Save,X,FileText,ArrowRight} from 'lucide-react';
import {api} from '../api';
import {go,useApp,useAction,useResource} from '../context';
import {PageHead,Section,Field,Notice,Loading,ErrorBox,Empty} from '../components/UI';

const categories={FEATURE:'기능 제안',BUG:'오류 제보',USABILITY:'사용성 개선',OTHER:'기타 의견'};
const statuses={RECEIVED:'접수',REVIEWING:'검토 중',DONE:'반영 완료',DEFERRED:'보류'};
type Category=keyof typeof categories;
type Status=keyof typeof statuses;
interface Item{id:string;title:string;category:Category;status:Status;created_at:string;updated_at:string;author_name:string;org_name:string;attachment_count:number}
interface Attachment{id:string;name:string;mime:string;size:number}
interface Detail extends Item{body:string;page:string;reply:string;version:number;attachments:Attachment[]}
const accept='.jpg,.jpeg,.png,.webp,.pdf,.hwp,.hwpx,.xls,.xlsx,.docx,.pptx,.txt,.csv,.zip';
const size=(bytes:number)=>bytes>=1048576?(bytes/1048576).toFixed(1)+'MB':Math.ceil(bytes/1024)+'KB';
const date=(value:string)=>new Date(value).toLocaleString('ko-KR');
function StatusBadge({status}:{status:Status}){return <span className={'badge feedback-status '+status}>{statuses[status]}</span>;}

function Composer(){
  const {notify}=useApp(),input=useRef<HTMLInputElement>(null),lock=useRef(false),requestKey=useRef(crypto.randomUUID());
  const [title,setTitle]=useState(''),[category,setCategory]=useState<Category>('FEATURE'),[body,setBody]=useState(''),[page,setPage]=useState('');
  const [files,setFiles]=useState<File[]>([]),[previews,setPreviews]=useState<Record<number,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const urls:Record<number,string>={};files.forEach((f,i)=>{if(['image/jpeg','image/png','image/webp'].includes(f.type))urls[i]=URL.createObjectURL(f);});setPreviews(urls);return()=>Object.values(urls).forEach(URL.revokeObjectURL);},[files]);
  async function submit(e:React.FormEvent){
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const form=new FormData();form.set('title',title);form.set('category',category);form.set('body',body);form.set('page',page);form.set('requestKey',requestKey.current);
      files.forEach(file=>form.append('files',file));
      const result=await api<{id:string}>('/feedback',{method:'POST',body:form});
      notify('개선사항과 첨부파일을 접수했습니다. 내 접수 내역에서 확인할 수 있습니다.');go('/feedback/'+result.id);
    }catch(e){setError((e instanceof Error?e.message:'접수하지 못했습니다.')+' 입력한 내용과 선택한 파일은 유지됩니다.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <form onSubmit={e=>void submit(e)} className="feedback-form">
    <fieldset disabled={busy}>
      <div className="form-grid"><Field label="의견 유형"><select value={category} onChange={e=>setCategory(e.target.value as Category)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><Field label="관련 화면 (선택)"><input maxLength={200} placeholder="예: 물품 올리기, 배송비 예상" value={page} onChange={e=>setPage(e.target.value)}/></Field></div>
      <Field label="개선사항 제목"><input minLength={2} maxLength={100} required placeholder="어떤 점을 개선하면 좋을까요?" value={title} onChange={e=>setTitle(e.target.value)}/></Field>
      <Field label="개선사항 내용" help="현재 불편한 점과 원하는 동작을 알려주세요. 오류라면 발생 순서도 적어 주세요."><textarea rows={6} minLength={10} maxLength={5000} required value={body} onChange={e=>setBody(e.target.value)} placeholder="화면, 발생 상황, 기대하는 결과 등을 10자 이상 적어 주세요."/></Field>
      <div className="feedback-upload">
        <input ref={input} type="file" data-testid="feedback-files" hidden multiple accept={accept} onChange={e=>{
          const selected=Array.from(e.target.files||[]);e.target.value='';
          const next=[...files];for(const f of selected)if(!next.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))next.push(f);
          if(next.length>5){setError('첨부파일은 최대 5개입니다.');return;}
          if(next.some(f=>f.size>8*1048576||f.size===0)){setError('비어 있지 않은 8MB 이하 파일을 선택하세요.');return;}
          setFiles(next);setError('');
        }}/>
        <button type="button" className="button secondary" onClick={()=>input.current?.click()} disabled={files.length>=5}><Paperclip size={18}/>이미지·파일 첨부</button><span className="fineprint">{files.length}/5개 · 파일당 8MB</span>
      </div>
      <p className="fineprint">사진(JPG·PNG·WebP), PDF, 한글, 엑셀, DOCX/PPTX, TXT/CSV, ZIP · 사진은 위치 등 메타데이터를 제거하고 WebP로 저장합니다. 화면 속 개인정보는 가려 주세요.</p>
      <ul className="feedback-selected">{files.map((f,i)=><li key={f.name+'-'+i}>{previews[i]?<img src={previews[i]} alt={f.name+' 미리보기'}/>:<FileText size={24}/>}<span><strong>{f.name}</strong><small>{size(f.size)}</small></span><button className="icon-button" type="button" aria-label={f.name+' 선택 취소'} onClick={()=>setFiles(v=>v.filter((_,n)=>n!==i))}><X size={18}/></button></li>)}</ul>
    </fieldset>
    {error?<Notice tone="warning">{error}</Notice>:null}
    <button type="submit" className="button primary full" disabled={busy}><Send size={18}/>{busy?'접수 중…':'개선사항 접수하기'}</button>
    <p className="fineprint">접수한 내용은 본인과 운영관리자만 확인합니다. 비밀번호·API 키·개인정보는 첨부하지 마세요.</p>
  </form>;
}

function ListPage(){
  const {user}=useApp(),admin=user.role==='ADMIN';
  const {data,loading,error,reload}=useResource<Item[]>('/feedback');const [filter,setFilter]=useState('');
  const items=(data||[]).filter(x=>!filter||x.status===filter);
  return <><PageHead title="개선사항" description="불편한 점이나 필요한 기능을 알려주세요. 화면 캡처와 참고 파일도 함께 보낼 수 있어요." action={<MessageSquarePlus size={30}/>}/>
    <div className="feedback-layout"><Section title="새 의견 보내기" description="운영관리자가 내용을 확인하고 처리 상태와 답변을 남깁니다."><Composer/></Section>
      <Section title={admin?'전체 접수 내역':'내 접수 내역'} description="최근 100건 · 선택하면 첨부파일과 처리 내용을 확인할 수 있습니다." action={<button type="button" className="text-button" onClick={reload}>새로고침</button>}>
        <Field label="처리 상태 필터"><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">전체 상태</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
        {loading?<Loading/>:error?<ErrorBox message={error} retry={reload}/>:items.length?<div className="feedback-list">{items.map(item=><a className="feedback-card" key={item.id} href={'#/feedback/'+item.id}><div><StatusBadge status={item.status}/><span className="subtle">{categories[item.category]}</span></div><h3>{item.title}</h3>{admin?<p>{item.org_name} · {item.author_name}</p>:null}<p><time dateTime={item.created_at}>{date(item.created_at)}</time>{item.attachment_count>0?<span><Paperclip size={13}/>{item.attachment_count}</span>:null}<ArrowRight size={17}/></p></a>)}</div>:<Empty title="접수된 의견이 없습니다" description="새 의견을 보내면 이곳에서 확인할 수 있어요."/>}
      </Section></div></>;
}

function DetailPage({id}:{id:string}){
  const {user}=useApp(),admin=user.role==='ADMIN', {data,loading,error,reload}=useResource<Detail>('/feedback/'+id),{busy,run}=useAction();
  const [status,setStatus]=useState<Status>('RECEIVED'),[reply,setReply]=useState('');
  useEffect(()=>{if(data){setStatus(data.status);setReply(data.reply);}},[data?.id,data?.version]);
  if(loading)return <Loading/>;
  if(error||!data)return <><PageHead title="개선사항" back="/feedback"/><ErrorBox message={error||'접수 내역을 찾지 못했습니다.'} retry={reload}/></>;
  return <><PageHead title={data.title} back="/feedback" description={categories[data.category]} action={<StatusBadge status={data.status}/>}/>
    <div className="feedback-detail"><Section title="접수 내용"><p className="subtle">{data.org_name} · {data.author_name} · {date(data.created_at)}</p>{data.page?<p><strong>관련 화면</strong> {data.page}</p>:null}<p className="feedback-body">{data.body}</p>
      <h3>첨부파일 {data.attachments.length}개</h3>{data.attachments.length?<div className="feedback-files">{data.attachments.map(f=><a key={f.id} href={'/api/files/'+f.id}>{f.mime==='image/webp'?<img alt={f.name} src={'/api/feedback/'+id+'/attachments/'+f.id+'/preview'}/>:<FileText size={30}/>}<span><strong>{f.name}</strong><small>{size(f.size)} · 다운로드{f.mime==='image/webp'?' (WebP)':''}</small></span></a>)}</div>:<p className="subtle">첨부파일이 없습니다.</p>}</Section>
      <Section title="처리 상태·답변"><p><StatusBadge status={data.status}/> <span className="subtle">최종 변경 {date(data.updated_at)}</span></p>{data.reply?<p className="feedback-body feedback-reply">{data.reply}</p>:<p className="subtle">아직 등록된 답변이 없습니다.</p>}
        {admin?<form onSubmit={e=>{e.preventDefault();void run(async()=>{await api('/feedback/'+id,{method:'PATCH',body:JSON.stringify({status,reply,version:data.version})});reload();},'처리 상태와 답변을 저장했습니다.');}}><Field label="처리 상태"><select value={status} onChange={e=>setStatus(e.target.value as Status)}>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><Field label="운영관리자 답변"><textarea rows={5} maxLength={5000} value={reply} onChange={e=>setReply(e.target.value)}/></Field><button className="button primary" disabled={busy}><Save size={18}/>처리 내용 저장</button></form>:null}
      </Section></div></>;
}

export default function Feedback({id}:{id?:string}){return id?<DetailPage id={id}/>:<ListPage/>;}
