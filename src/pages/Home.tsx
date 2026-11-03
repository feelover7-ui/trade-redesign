import {Package,ArrowUpRight,ClipboardCheck,ArrowLeftRight,TriangleAlert,FilePenLine} from 'lucide-react';
import {useApp,useResource} from '../context';
import type {Lot,Transfer} from '../types';
import {PageHead,Badge,Loading,ErrorBox,Progress} from '../components/UI';

// 주고받기 한 건에서 지금 우리 기관이 해야 할 일 (서버 규칙은 Requests 화면과 같음, 화면 안내만)
export function myTurn(t:Transfer){if(t.side==='sender'&&t.state==='REQUESTED')return '신청을 선정해 주세요';if(t.side==='sender'&&t.state==='RESERVED')return '인계를 기록해 주세요';if(t.side==='receiver'&&t.state==='SENT')return '받은 수량을 확인해 주세요';if(t.state==='RECEIVED')return '증빙·대장 반영을 확인해 주세요';if(t.state==='DISPUTED')return '수량 불일치를 확인해 주세요';return '';}
export function theirTurn(t:Transfer){if(t.side==='receiver'&&t.state==='REQUESTED')return '상대 기관이 선정 중';if(t.side==='receiver'&&t.state==='RESERVED')return '상대 기관이 인계 준비 중';if(t.side==='sender'&&t.state==='SENT')return '상대 기관이 인수 확인 중';return '';}
const ago=(iso:string)=>{const d=Math.floor((Date.now()-new Date(iso).getTime())/86400000);return d<=0?'오늘':d===1?'어제':d+'일 전';};
function Photo({lot}:{lot:Lot}){return lot.photos[0]?<img src={'/api/files/'+lot.photos[0].id} alt=""/>:lot.hasCatalogImage?<img src={'/api/lots/'+lot.id+'/catalog-image'} alt=""/>:<div className="work-photo"><Package/></div>;}

export default function Home(){
  const {user}=useApp();
  const mine=useResource<Lot[]>('/lots?mine=true'),reqs=useResource<Transfer[]>('/requests'),market=useResource<Lot[]>('/lots?sort=new');
  if(mine.loading||reqs.loading)return <Loading/>;
  if(mine.error||reqs.error)return <ErrorBox message={mine.error||reqs.error} retry={()=>{mine.reload();reqs.reload();}}/>;
  const lots=mine.data||[],requests=reqs.data||[];
  const reviewer=user.role==='REVIEWER';
  const toReview=lots.filter(l=>l.state==='REVIEW'&&(l.reviewEligible??l.creatorId!==user.id));
  const drafts=lots.filter(l=>l.state==='DRAFT');
  const turn=requests.filter(t=>myTurn(t)&&t.state!=='DISPUTED'),stuck=requests.filter(t=>t.state==='DISPUTED'),waiting=requests.filter(t=>theirTurn(t));
  const first=reviewer?{tone:'amber',label:'검토해 주세요',icon:ClipboardCheck,items:toReview,who:toReview.map(l=>l.title).slice(0,2).join(', ')||'검토할 물품이 없습니다',href:toReview[0]?'#/lots/'+toReview[0].id:'#/work',btn:'검토하기'}
    :{tone:'amber',label:'마저 작성하기',icon:FilePenLine,items:drafts,who:drafts.map(l=>l.title).slice(0,2).join(', ')||'작성 중인 물품이 없습니다',href:drafts[0]?'#/lots/'+drafts[0].id:'#/new',btn:drafts.length?'이어서 작성':'물품 올리기'};
  const cards=[first,
    {tone:'blue',label:'주고받기 · 내 차례',icon:ArrowLeftRight,items:turn,who:turn[0]?myTurn(turn[0])+' · '+turn[0].title+(turn.length>1?' 외 '+(turn.length-1)+'건':''):'지금 내 차례인 건이 없습니다',href:turn[0]?'#/requests/'+turn[0].id:'#/requests',btn:turn.length?'처리하기':'전체 보기'},
    {tone:'red',label:'멈춤 · 수량 불일치',icon:TriangleAlert,items:stuck,who:stuck[0]?stuck[0].title+' · 양쪽 확인 필요':'멈춘 건이 없습니다',href:stuck[0]?'#/requests/'+stuck[0].id:'#/requests',btn:stuck.length?'확인하기':'기록 보기'}];
  const total=cards.reduce((s,c)=>s+(c.label==='마저 작성하기'?0:c.items.length),0);
  const near=(market.data||[]).filter(l=>!l.own).slice(0,4);
  return <>
    <PageHead title="오늘 할 일" description={user.org_name+' · '+user.name+'님이 처리할 일 '+total+'건'}/>
    <section className="home-tasks" aria-label="오늘 할 일">{cards.map(c=><a key={c.label} className={'home-task tone-'+c.tone} href={c.href}><span className="home-task-label"><c.icon size={17}/>{c.label}</span><strong>{c.items.length}<small>건</small></strong><span className="home-task-who">{c.who}</span><span className={'button compact '+(c.items.length?'primary':'secondary')}>{c.btn}</span></a>)}</section>
    {waiting.length?<div className="home-waiting">{waiting.map(t=><a key={t.id} href={'#/requests/'+t.id}><b>{t.title}</b> · {theirTurn(t)}</a>)}</div>:null}
    <div className="home-columns">
      <section className="home-panel"><div className="home-panel-head"><h2>우리 물품 진행 상황</h2><a href="#/work">전체 보기</a></div>
        {lots.length?lots.slice(0,6).map(l=><a className="home-row" key={l.id} href={'#/lots/'+l.id}><Photo lot={l}/><div><b>{l.title}</b><span>가용 {l.available}개 · {ago(l.updatedAt||l.createdAt)} 수정</span><Progress state={l.state} compact/></div><Badge state={l.state}/></a>):<p className="subtle">아직 올린 물품이 없습니다. <a href="#/new">물품 올리기</a></p>}
      </section>
      <section className="home-panel"><div className="home-panel-head"><h2>이웃 기관 새 물품</h2><a href="#/market">물품 찾기</a></div>
        {market.loading?<Loading/>:near.length?near.map(l=><a className="home-row" key={l.id} href={'#/lots/'+l.id}><Photo lot={l}/><div><b>{l.title}</b><span>{l.orgName.replace('가상 ','')} · {l.district} · {ago(l.createdAt)}</span></div><span className="badge state-PUBLISHED">{l.available}개</span></a>):<p className="subtle">새로 올라온 물품이 없습니다.</p>}
      </section>
    </div>
    <p className="home-foot"><ArrowUpRight size={15}/>건수는 우리 기관이 지금 처리해야 하는 것만 셉니다. 상대 기관 차례인 건은 위 초록 줄에 따로 보여 줍니다.</p>
  </>;
}
