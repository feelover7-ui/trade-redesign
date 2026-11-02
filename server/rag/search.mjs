import {DatabaseSync} from 'node:sqlite';
import {existsSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {APP_GUIDES} from './app-guide.mjs';
export const INDEX_SCHEMA=`CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,currentness TEXT NOT NULL,date_note TEXT NOT NULL,original_name TEXT NOT NULL,original_path TEXT NOT NULL,sha256 TEXT NOT NULL,metadata TEXT NOT NULL); CREATE TABLE chunks(id TEXT PRIMARY KEY,doc_id TEXT NOT NULL,locator TEXT NOT NULL,line_start INTEGER NOT NULL,line_end INTEGER NOT NULL,text TEXT NOT NULL,quality TEXT NOT NULL); CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED,title,body,grams,tokenize='unicode61'); CREATE INDEX chunks_doc ON chunks(doc_id); PRAGMA user_version=1;`;
export {terms,grams} from './query.mjs';
import {terms,grams,normalize,queryPlan} from './query.mjs';
function insertApp(db){db.exec(INDEX_SCHEMA);const d=db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)'),c=db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)'),s=db.prepare('INSERT INTO search(id,title,body,grams) VALUES(?,?,?,?)');for(const item of APP_GUIDES){d.run(item.id,item.title,item.kind,item.currentness,item.dateNote,'','','',JSON.stringify({route:item.route}));c.run(item.id+'-1',item.id,'프로그램 사용 안내',1,1,item.text,'AUTHORED');s.run(item.id+'-1',item.title,item.text,grams(item.title+' '+item.text));}}
export class KnowledgeBase {
 constructor({dir,libraryEnabled=false}={}){this.dir=dir?resolve(dir):null;this.app=new DatabaseSync(':memory:');insertApp(this.app);this.library=null;this.warning='';if(libraryEnabled){if(!this.dir||!existsSync(resolve(this.dir,'index.sqlite')))this.warning='지침 인덱스가 설치되지 않았습니다.';else {try{this.library=new DatabaseSync(resolve(this.dir,'index.sqlite'),{readOnly:true});if(this.library.prepare('PRAGMA user_version').get().user_version!==1)throw new Error('INDEX_VERSION');this.library.prepare('SELECT id FROM documents LIMIT 1').get();}catch{this.library?.close();this.library=null;this.warning='지침 인덱스 버전/무결성을 확인하세요.';}}}}
 close(){this.app.close();this.library?.close();}
 stats(){return {appDocuments:APP_GUIDES.length,libraryDocuments:this.library?Number(this.library.prepare('SELECT count(*) n FROM documents').get().n):0,libraryChunks:this.library?Number(this.library.prepare('SELECT count(*) n FROM chunks').get().n):0,warning:this.warning,retriever:'SQLite FTS5 BM25 + 한국어 2글자 검색 (벡터 아님)'};}
 search(question,{scope='all',limit=6}={}){
  const plan=queryPlan(question),{base,expanded}=plan;if(!plan.domain||!expanded.length)return [];
  const word=expanded.map(x=>'"'+x.replaceAll('"','')+'"*').join(' OR ');
  const bigrams=grams(expanded.join(' ')).split(' ').filter(Boolean).slice(0,70).map(x=>'"'+x+'"').join(' OR ');const pool=[];
  for(const [db,type]of [[this.app,'APP'],[this.library,'LIBRARY']]){
   if(!db||(scope==='app'&&type!=='APP')||(scope==='library'&&type==='APP'))continue;
   const focused=plan.anchors.map(t=>'"'+t+'"*').join(' OR ');
   const scores=new Map();for(const [q,weight]of [[word,1],[bigrams,.35],[focused,.8]]){if(!q)continue;const found=db.prepare('SELECT id,bm25(search,0,4,1,.4) rank FROM search WHERE search MATCH ? ORDER BY rank LIMIT 160').all(q);found.forEach((x,i)=>scores.set(x.id,(scores.get(x.id)||0)+weight/(20+i)));}
   const get=db.prepare('SELECT c.*,d.title,d.kind,d.currentness,d.date_note,d.original_name,d.original_path,d.metadata FROM chunks c JOIN documents d ON d.id=c.doc_id WHERE c.id=?');
   for(const[id,score]of scores){const x=get.get(id);if(!x||x.kind==='DESIGN'&&!plan.design)continue;
    const title=normalize(x.title),body=normalize(x.text),hay=title+' '+body,overlap=base.filter(t=>hay.includes(t)).length,coverage=expanded.filter(t=>hay.includes(t)).length;
    if(!overlap&&!coverage)continue;
    let bonus=overlap/Math.max(1,base.length)*.12+coverage/expanded.length*.08;
    bonus+=base.filter(t=>body.includes(t)).length/Math.max(1,base.length)*.12;
    if(type==='LIBRARY'&&x.text.length<120)bonus-=.16;
    if(type==='LIBRARY'&&(/source_filename:/.test(x.text)||/읽기 안내|삽입 자산 목록|본문 위치가 확인되지/.test(x.locator)))bonus-=.10;
    if(type==='LIBRARY'&&/신.?구조문|개\s*정\s*\(안\)/.test(x.title+' '+x.text))bonus-=.05;
    bonus+=expanded.filter(t=>title.includes(t)).length*.012;
    if(/금액|가격|단가/.test(question)&&/\d[\d,.\s]*만?\s*원/.test(x.text)&&expanded.some(t=>/매각|계약/.test(t)&&hay.includes(t)))bonus+=.10;
    if(/수의매각|수의계약/.test(question)&&/(?:단가|총액|합계|예정가격|매각대금|매각금액)[^\n]{0,60}\d[\d,\s]*만?\s*원[^\n]{0,25}이하/.test(x.text))bonus+=.14;
    if(/생략/.test(question)&&/생략/.test(x.text))bonus+=.07;
    if(plan.policy&&type==='APP')bonus-=.15;
    if(plan.app)bonus+=type==='APP'?.22:-.12;
    if(plan.app&&/사용감|묶음|그룹|상태.*입력/.test(question)&&/상태 빠른 입력/.test(x.title))bonus+=.08;
    if(/조례|시행규칙/.test(question)&&/조례|시행규칙/.test(x.title))bonus+=.035;
    if(/서울|학교/.test(question)&&/서울|교육청|학교/.test(hay))bonus+=.025;
    if(x.quality==='OCR')bonus-=.02;if(x.kind==='DESIGN')bonus-=.08;
    pool.push({...x,source:type,score:score+bonus,metadata:JSON.parse(x.metadata)});
   }
  }
  pool.sort((a,b)=>b.score-a.score);const count=new Map(),out=[];
  for(const x of pool){if(plan.app&&scope==='all'&&pool[0]?.source==='APP'&&x.source!=='APP')continue;if((count.get(x.doc_id)||0)>=2)continue;count.set(x.doc_id,(count.get(x.doc_id)||0)+1);out.push(this.publicChunk(x));if(out.length>=Math.min(limit,10))break;}return out;
 }
 evidence(question,{scope='all',limit=8,maxChars=14000}={}){
  const primary=this.search(question,{scope,limit:6}),out=[],ids=new Set();let chars=0;
  const add=s=>{if(!s||ids.has(s.id)||out.length>=limit||chars+s.text.length>maxChars)return;ids.add(s.id);chars+=s.text.length;out.push(s);};
  // Keep top matches, then recover split table/exception context near the first two.
  primary.slice(0,4).forEach(add);
  for(const s of primary.slice(0,2)){
   if(s.source!=='LIBRARY')continue;
   const nearby=this.library.prepare('SELECT id,line_start,line_end FROM chunks WHERE doc_id=? AND locator=? AND id<>? AND line_start<=? AND line_end>=? ORDER BY abs(line_start-?) LIMIT 2').all(s.documentId,s.locator,s.id,s.lineEnd+6,s.lineStart-6,s.lineEnd);
   nearby.forEach(x=>add(this.chunk(x.id)));
  }
  primary.slice(4).forEach(add);return out;
 }
 publicChunk(x){return {id:x.id,documentId:x.doc_id,title:x.title,kind:x.kind,currentness:x.currentness,dateNote:x.date_note,locator:x.locator,lineStart:x.line_start,lineEnd:x.line_end,text:x.text,quality:x.quality,source:x.source,route:x.metadata?.route||null,originalName:x.original_name,originalAvailable:!!this.originalPath(x.original_path),score:x.score||0};}
 originalPath(path){if(!this.dir||!path)return null;const root=resolve(this.dir,'originals'),candidate=resolve(root,path);const rel=relative(root,candidate);if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(candidate))return null;try{const real=realpathSync(candidate);const r=relative(realpathSync(root),real);return !r.startsWith('..')&&!isAbsolute(r)?real:null;}catch{return null;}}
 document(id){for(const [db,source]of [[this.app,'APP'],[this.library,'LIBRARY']]){if(!db)continue;const d=db.prepare('SELECT * FROM documents WHERE id=?').get(id);if(d)return {...d,source,original:this.originalPath(d.original_path),chunks:db.prepare('SELECT * FROM chunks WHERE doc_id=? ORDER BY line_start,id').all(id)};}return null;}
 chunk(id){for(const[db,source]of [[this.app,'APP'],[this.library,'LIBRARY']]){if(!db)continue;const x=db.prepare('SELECT c.*,d.title,d.kind,d.currentness,d.date_note,d.original_name,d.original_path,d.metadata FROM chunks c JOIN documents d ON d.id=c.doc_id WHERE c.id=?').get(id);if(x)return this.publicChunk({...x,source,metadata:JSON.parse(x.metadata)});}return null;}
}
