import {useEffect,useRef,useState} from 'react';
import {api,post} from '../api';
import {useResource} from '../context';
import type {Lot} from '../types';
import type {ProviderStatus} from './ProductAssistant';
import {Notice,Section} from '../components/UI';
interface Row{id:string;title:string;message:string;version?:number;suggestionId?:string;fields?:string[];applied?:boolean}
export default function CatalogBatch({lotIds,autoStart=false,autoFill=false}:{lotIds:string[];autoStart?:boolean;autoFill?:boolean}){
 const {data:status}=useResource<ProviderStatus>('/assistant/status');const [busy,setBusy]=useState(false),[rows,setRows]=useState<Row[]>([]),[progress,setProgress]=useState(0),[offset,setOffset]=useState(0);
 const stopped=useRef(false),mounted=useRef(true),lock=useRef(false),automatic=useRef(false);const all=[...new Set(lotIds)],ids=all.slice(offset,offset+50);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopped.current=true;};},[]);
 const start=async()=>{
  if(lock.current||!status?.procurement.configured)return;lock.current=true;setBusy(true);stopped.current=false;setRows([]);setProgress(0);
  try{for(const id of ids){if(stopped.current||!mounted.current)break;let row:Row={id,title:id,message:''};
   try{
    const lot=await api<Lot>('/lots/'+id);row.title=lot.title;
    if(lot.state!=='DRAFT')row.message='초안 아님 · 건너뜀';else{
     const result=await post<{suggestions:{id:string;proposal:Record<string,string>}[];notes:string[]}>('/lots/'+id+'/enrich',{mode:'CATALOG',name:lot.title,identificationCode:lot.actualIdentificationCode||lot.source?.identificationCode||''});
     const exact=result.suggestions.find(s=>s.proposal.matchType==='EXACT_IDENTIFIER');
     if(exact){const fields=['manufacturer','model','description','actualIdentificationCode','classificationName'].filter(k=>!lot.data?.[k as keyof typeof lot.data]&&exact.proposal[k]);row={...row,message:fields.length?'번호 일치 · 빈칸 '+fields.length+'개 보완 가능':'번호 일치 · 기존 정보 보존',version:lot.version,suggestionId:exact.id,fields};
      if(autoFill&&fields.length&&!stopped.current&&mounted.current){await post('/suggestions/'+exact.id+'/apply',{fields,version:lot.version,emptyOnly:true});row.applied=true;row.message='번호 일치 정보로 빈칸 입력 완료 · 실물 확인 필요';}
     }else row.message=result.suggestions.length?'품명 후보 있음 · 초안에서 선택':result.notes.join(' ')||'조회 결과 없음 · 직접 입력 가능';
    }
   }catch(e){row.message=e instanceof Error?e.message:'조회 실패';if(/한도|인증|활용신청/.test(row.message))stopped.current=true;}
   if(mounted.current){setRows(v=>[...v,row]);setProgress(v=>v+1);}if(!stopped.current)await new Promise(r=>setTimeout(r,750));
  }}finally{lock.current=false;if(mounted.current)setBusy(false);}
 };
 useEffect(()=>{if(!autoStart||automatic.current||!status?.procurement.configured)return;const timer=setTimeout(()=>{automatic.current=true;void start();},0);return()=>clearTimeout(timer);},[autoStart,status?.procurement.configured]);
 const apply=async()=>{if(lock.current)return;lock.current=true;stopped.current=false;setBusy(true);try{for(const row of rows.filter(r=>r.suggestionId&&r.fields?.length&&!r.applied)){if(!mounted.current||stopped.current)break;
  try{await post('/suggestions/'+row.suggestionId+'/apply',{fields:row.fields,version:row.version,emptyOnly:true});if(mounted.current)setRows(v=>v.map(r=>r.id===row.id?{...r,applied:true,message:'빈칸 입력 완료 · 원본 보존'}:r));}
  catch(e){if(mounted.current)setRows(v=>v.map(r=>r.id===row.id?{...r,message:e instanceof Error?e.message:'반영 실패'}:r));}
 }}finally{lock.current=false;if(mounted.current)setBusy(false);}};
 return <Section title="등록 물품 조달정보 보완" description="파일에서 읽은 정보는 보존하고, 조달청에서 확인한 제품정보를 추가합니다.">
 <p className="fineprint">번호가 일치해도 실제 명판과 대조하세요. 원본 번호·수량·물품상태·취득금액은 바꾸지 않습니다. 품명 검색 후보는 자동 반영하지 않습니다.</p>
 <div className="actions"><button type="button" className="button secondary" disabled={busy||!ids.length||!status?.procurement.configured} onClick={()=>void start()}>선택 {ids.length}묶음 조회</button>{busy?<button type="button" className="button secondary" onClick={()=>{stopped.current=true;}}>현재 조회 후 중단</button>:null}<span role="status">처리 {progress} / {ids.length}{all.length>50?` · 전체 ${all.length}묶음 중 ${offset+1}–${offset+ids.length}`:''}</span></div>
 {!status?.procurement.configured?<Notice>조달청 키가 설정되면 이 단계에서 제품정보를 조회할 수 있습니다. 파일로 등록한 초안은 그대로 보관됩니다.</Notice>:null}
 <progress aria-label="조달청 일괄 조회 진행률" value={progress} max={Math.max(1,ids.length)}/>
 {rows.length?<><div className="table-scroll"><table><thead><tr><th>물품</th><th>조회·입력 결과</th><th>확인</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.message}</td><td><a href={'#/lots/'+r.id+'/edit'}>초안 확인</a></td></tr>)}</tbody></table></div><button type="button" className="button primary" disabled={busy||!rows.some(r=>r.fields?.length&&!r.applied)} onClick={()=>void apply()}>번호 일치 후보의 빈칸만 일괄 반영</button></>:null}
 {all.length>50?<div className="actions"><button type="button" className="button secondary" disabled={busy||offset===0} onClick={()=>{setOffset(x=>Math.max(0,x-50));setRows([]);setProgress(0);}}>이전 50묶음</button><button type="button" className="button secondary" disabled={busy||offset+50>=all.length} onClick={()=>{setOffset(x=>x+50);setRows([]);setProgress(0);}}>다음 50묶음</button></div>:null}
 </Section>;
}
