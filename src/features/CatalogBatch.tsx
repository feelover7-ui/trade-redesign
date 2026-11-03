import {useEffect,useRef,useState} from 'react';
import {api,post} from '../api';
import {useResource} from '../context';
import type {Lot} from '../types';
import type {ProviderStatus} from './ProductAssistant';
import {Notice,Section} from '../components/UI';
interface Row{id:string;title:string;message:string;version?:number;suggestionId?:string;fields?:string[];applied?:boolean}
export default function CatalogBatch({lotIds}:{lotIds:string[]}){
 const {data:status}=useResource<ProviderStatus>('/assistant/status');const [busy,setBusy]=useState(false),[rows,setRows]=useState<Row[]>([]),[progress,setProgress]=useState(0);const stopped=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopped.current=true;};},[]);
 const ids=[...new Set(lotIds)].slice(0,50);
 const start=async()=>{if(busy)return;setBusy(true);stopped.current=false;setRows([]);setProgress(0);
  try{for(const id of ids){if(stopped.current)break;let row:Row={id,title:id,message:''};try{
   const lot=await api<Lot>('/lots/'+id);row.title=lot.title;if(lot.state!=='DRAFT'){row.message='초안 아님 · 건너뜀';}else{
    const result=await post<{suggestions:{id:string;proposal:Record<string,string>}[];notes:string[]}>('/lots/'+id+'/enrich',{mode:'CATALOG',name:lot.title,identificationCode:lot.actualIdentificationCode||lot.source?.identificationCode||''});
    const exact=result.suggestions.find(s=>s.proposal.matchType==='EXACT_IDENTIFIER');
    if(exact){const fields=['manufacturer','model','description','actualIdentificationCode','classificationName'].filter(k=>!lot.data?.[k as keyof typeof lot.data]&&exact.proposal[k]);row={...row,message:fields.length?'번호 일치 후보 · 빈칸 '+fields.length+'개 보완 가능':'번호 일치 후보 · 덮어쓸 빈칸 없음',version:lot.version,suggestionId:exact.id,fields};}
    else row.message=result.suggestions.length?'품명 후보 있음 · 상세에서 선택':result.notes.join(' ')||'검색 결과 없음';
   }
  }catch(e){row.message=e instanceof Error?e.message:'조회 실패';if(/한도|인증|활용신청/.test(row.message))stopped.current=true;}
  if(mounted.current){setRows(v=>[...v,row]);setProgress(v=>v+1);}if(!stopped.current)await new Promise(r=>setTimeout(r,750));
  }}finally{if(mounted.current)setBusy(false);}
 };
 const apply=async()=>{if(busy)return;setBusy(true);try{for(const row of rows.filter(r=>r.suggestionId&&r.fields?.length&&!r.applied)){
  if(!mounted.current)break;
  try{await post('/suggestions/'+row.suggestionId+'/apply',{fields:row.fields,version:row.version});if(mounted.current)setRows(v=>v.map(r=>r.id===row.id?{...r,applied:true,message:'선택한 빈칸 반영 완료'}:r));}
  catch(e){if(mounted.current)setRows(v=>v.map(r=>r.id===row.id?{...r,message:e instanceof Error?e.message:'반영 실패'}:r));}
 }}finally{if(mounted.current)setBusy(false);}};
 return <Section title="등록 물품 조달정보 일괄 보완" description="최대 50묶음씩 순차 조회합니다. 같은 번호는 서버 캐시로 재사용합니다."><Notice>조회만으로 내용을 바꾸지 않습니다. 정확번호 일치 후보도 실제 물품인지 검토하세요. 아래 반영 버튼은 비어 있는 제조사·모델·설명·현물번호·분류명만 채웁니다. 원본 대장·수량·품명·승인은 보존합니다.</Notice><div className="actions"><button type="button" className="button secondary" disabled={busy||!ids.length||!status?.procurement.configured} onClick={()=>void start()}>선택 {ids.length}묶음 조회</button>{busy?<button type="button" className="button secondary" onClick={()=>{stopped.current=true;}}>현재 조회 후 중단</button>:null}<span role="status">처리 {progress} / {ids.length}</span></div>{!status?.procurement.configured?<p>서버 API 설정 전에는 조회하지 않습니다.</p>:null}<progress aria-label="조달청 일괄 조회 진행률" value={progress} max={Math.max(1,ids.length)}/>{rows.length?<><div className="table-scroll"><table><thead><tr><th>물품</th><th>조회·반영 결과</th><th>확인</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.message}</td><td><a href={'#/lots/'+r.id+'/edit'}>초안 확인</a></td></tr>)}</tbody></table></div><button type="button" className="button primary" disabled={busy||!rows.some(r=>r.fields?.length&&!r.applied)} onClick={()=>void apply()}>번호 일치 후보의 빈칸만 일괄 반영</button></>:null}</Section>;
}
