import {z} from 'zod';
import {hash} from './auth.mjs';
import {must,transaction} from './db.mjs';
import {searchCatalog,providerStatus} from './providers.mjs';
import {splitListingNumber} from './catalog-identifiers.mjs';
const inputSchema=z.object({name:z.string().trim().max(100).default(''),identificationCode:z.string().regex(/^$|^\d{8}$/).default(''),listingNo:z.string().max(30).default('')}).strict();
const limit=(v,def,max)=>Number.isFinite(Number(v))&&Number(v)>0?Math.min(max,Math.floor(Number(v))):def;
export function createCatalogGateway(db,{env=process.env,fetcher=fetch}={}){
 const pending=new Map();
 return {async search(user,input){
  must(providerStatus(env).procurement.configured,'조달청 API 키·활용신청을 서버에 설정하세요.',503,'NOT_CONNECTED');
  const d=inputSchema.parse(input),parts=splitListingNumber(d.listingNo);
  if(parts){must(!d.identificationCode||d.identificationCode===parts.identificationCode,'목록번호와 식별번호가 다릅니다.');d.identificationCode=parts.identificationCode;}
  must(d.identificationCode||d.name.length>=2,'물품목록번호·식별번호 또는 두 글자 이상의 품명을 입력하세요.');
  const query=d.identificationCode?{identificationCode:d.identificationCode}:{name:d.name};
  const cacheKey=hash(JSON.stringify([query,hash(env.DATA_GO_KR_SERVICE_KEY),env.PROCUREMENT_KEY_PARAM||'serviceKey']));
  const old=db.prepare('SELECT * FROM catalog_cache WHERE query_hash=? AND expires_at>?').get(cacheKey,Date.now());
  if(old)return {candidates:JSON.parse(old.payload),cached:true,fetchedAt:old.fetched_at};
  if(pending.has(cacheKey))return pending.get(cacheKey);
  must(pending.size<2,'다른 조달청 조회가 진행 중입니다. 잠시 후 다시 시도하세요.',429,'PROVIDER_BUSY');
  const task=(async()=>{
   const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
   transaction(db,()=>{for(const [org,cap]of [[user.org_id,limit(env.PROCUREMENT_DAILY_LIMIT,300,10000)],['*',limit(env.PROCUREMENT_GLOBAL_DAILY_LIMIT,800,100000)]]){
    const used=db.prepare('SELECT calls FROM catalog_usage WHERE day=? AND org_id=?').get(day,org)?.calls||0;
    must(used<cap,'조달청 일일 조회 한도를 넘었습니다. 캐시·직접 입력을 이용하세요.',429,'CATALOG_QUOTA');
    db.prepare('INSERT INTO catalog_usage VALUES(?,?,1) ON CONFLICT(day,org_id) DO UPDATE SET calls=calls+1').run(day,org);
   }});
   const candidates=await searchCatalog(query,{env,fetcher});const fetchedAt=new Date().toISOString();
   const ttl=candidates.length?limit(env.PROCUREMENT_CACHE_TTL_SECONDS,21600,86400):300;
   transaction(db,()=>{db.prepare('DELETE FROM catalog_cache WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT OR REPLACE INTO catalog_cache VALUES(?,?,?,?)').run(cacheKey,JSON.stringify(candidates),fetchedAt,Date.now()+ttl*1000);
    db.exec('DELETE FROM catalog_cache WHERE query_hash IN (SELECT query_hash FROM catalog_cache ORDER BY expires_at DESC LIMIT -1 OFFSET 5000)');
   });
   return {candidates,cached:false,fetchedAt};
  })();pending.set(cacheKey,task);try{return await task;}finally{pending.delete(cacheKey);}
 }};
}
