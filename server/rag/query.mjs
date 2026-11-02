/** Bounded Korean query expansion. No remote embeddings or private corpus in code. */
const stop=new Set(['어떻게','가능','있나요','있어','해줘','알려줘','주세요','무엇','어떤','관련','해요','되나요','하는','하면','대해서','그리고','그럼','그거','이거','그걸','왜','방법은','방법','프로그램','우리','물품이음','물품','관련된','기준으로','무조건','서울','서울시','서울시교육청','학교','기관','경우','언제','어디','싶어요','하려면','있어요']);
export const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/(?<=\d),(?=\d)/g,'');
export function terms(text){return [...new Set((normalize(text).match(/[\p{L}\p{N}]+/gu)||[]).map(s=>s.replace(/(에서는|으로는|이란|에서|으로|에게|하는|해야|하면|은|는|을|를|이|가|도|의|에|과|와)$/u,m=>s.length-m.length>=2?'':m)).filter(s=>s.length>1&&!stop.has(s)))].slice(0,18);}
export function grams(text){const a=[];for(const w of normalize(text).match(/[가-힣a-z0-9]+/g)||[]){for(let i=0;i<w.length-1;i++)a.push(w.slice(i,i+2));}return [...new Set(a)].join(' ');}
const concepts=[
 [/관리전환|소관전환|넘기|넘겨|나눠|나누|공짜|무상/g,['관리전환','소관전환','무상','양여']],
 [/양식|서식|합의서/g,['서식','합의서']],
 [/엑셀|xlsx|xls|csv|업로드/g,['엑셀','업로드']],
 [/소요조회|수요조회/g,['소요조회']],
 [/재고|예약|배정|가용/g,['예약','배정','가용']],
 [/사용감|(?:묶음|그룹).*(?:물품|수량|입력|나누|상태)|상태.*배분/g,['사용감','상태','수량']],
 [/저장매체|파쇄|완전삭제|완전 삭제|불용.*pc|불용.*컴퓨터/g,['저장매체','파쇄','완전삭제','정보보안']],
 [/배송|운반|운송|견적/g,['배송','운반','운송']],
 [/로그인|비밀번호|계정/g,['로그인','비밀번호','계정']],
 [/불용품/g,['불용']],
 [/수의매각|수의계약/g,['수의매각','수의계약']],
];
export function queryPlan(question){
 const q=normalize(question),base=terms(q),matched=concepts.filter(([re])=>{re.lastIndex=0;return re.test(q);}),anchors=['소요조회','생략','수의매각','수의계약','관리전환','불용결정','물품선정위원회','인계','인수'].filter(t=>q.includes(t)),expanded=[...new Set([...base,...anchors,...matched.flatMap(([,t])=>t)])].slice(0,32);
 const domain=matched.length>0||/물품|불용|전환|양여|매각|폐기|인계|인수|재물|조달|온비드|에듀파인|품명|식별번호|자산|취득|장부|대장|검토|승인|사진|등록|배송|신청|수량|지침|조례|규칙|rag|ai|개선|의견|오류|채팅|설정|모델|물품선정위원회/.test(q);
 const policy=/의무|법령|조례|규칙|규정|지침|금액|생략|수의매각|취득가격|대상물품|표준서식|파쇄|완전삭제|위원회|소요조회.*(기간|15일|대상|해야)/.test(q);
 const app=!policy&&/물품이음|사이트|버튼|엑셀|업로드|로그인|비밀번호|계정|재고|예약|예비.?배정|사용감|묶음|그룹|사진|배송비|개선사항|오류|채팅|상태.*입력|대화.*저장|넘기|넘겨|공짜/.test(q);
 return {q,base,expanded,anchors,domain,policy,app,design:/설계|개발|아키텍처|구현/.test(q)};
}
export function contextualQuestion(question,history=[]){
 // A new short question or the word '그룹/서식' is not by itself a follow-up.
 const follow=/^(그럼|그러면|그것|이것|그거|이거|그걸|해당|위의|앞서|방금|그\s+(?:경우|물품|절차|양식|서식))|^(?:양식|서식|예외|기간|근거)(?:은|는|도|만)?\s*(?:요|어디|있|찾|알려|뭐|어떻게|\?)/.test(question.trim());
 return follow&&history.length?question+' '+history.at(-1).slice(0,320):question;
}
