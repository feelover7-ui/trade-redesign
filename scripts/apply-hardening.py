from pathlib import Path

def replace(path, old, new):
    p=Path(path)
    s=p.read_text()
    if s.count(old)!=1:
        raise RuntimeError(f'Expected one exact patch target in {path}: {old[:70]} (found {s.count(old)})')
    p.write_text(s.replace(old,new))

replace('server/service.mjs', 'function activeCount(db,lotId)', '''function authoredLot(db,user,id){return !!db.prepare("SELECT 1 FROM audit_events WHERE actor_id=? AND ((entity_id=? AND action IN ('LOT_CREATE','LOT_EDIT')) OR (action IN ('FILE_UPLOAD','DRAFT_FILE_DELETE') AND json_extract(detail,'$.lotId')=?)) LIMIT 1").get(user.id,id,id);}
function activeCount(db,lotId)''')
replace('server/service.mjs', "creatorId:row.creator_id,reviewerId:row.reviewer_id", "creatorId:row.creator_id,reviewerId:row.reviewer_id,reviewEligible:user.role==='REVIEWER'&&row.creator_id!==user.id&&!authoredLot(db,user,row.id)")
replace('server/service.mjs', "original=ownLot(db,user,id);must(['DRAFT','PAUSED'].includes(original.state)", "original=ownLot(db,user,id);const source=JSON.parse(original.source_snapshot);for(const key of ['originalName','classificationCode','identificationCode','ledgerCount'])d[key]=source[key];must(['DRAFT','PAUSED'].includes(original.state)")
replace('server/service.mjs', "must(row.creator_id!==user.id,'작성자 본인은 게시 검토를 승인할 수 없습니다.',403);", "must(row.creator_id!==user.id&&!authoredLot(db,user,id),'본문·첨부를 작성하거나 수정한 담당자는 본 건을 직접 검토 승인할 수 없습니다.',403);")
replace('server/app.mjs', "import {capabilities} from './integrations.mjs';", "import {capabilities} from './integrations.mjs';\nimport {normalizeUploadName} from './file-names.mjs';")
replace('server/app.mjs', "const id=uid(),diskName=`${id}.${ext}`;", "const id=uid(),diskName=`${id}.${ext}`,displayName=normalizeUploadName(req.file.originalname);")
replace('server/app.mjs', "try{transaction(db,()=>{db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')", "try{transaction(db,()=>{if(lotId){must(svc.ownLot(db,req.user,lotId).state==='DRAFT','검토가 시작되어 첨부를 변경할 수 없습니다.',409);}else{const current=svc.caseRow(db,req.user,requestId);must(!['DONE','DECLINED','CANCELLED'].includes(current.state),'거래가 종료되어 첨부를 변경할 수 없습니다.',409);}const currentCount=db.prepare(lotId?'SELECT COUNT(*) AS n FROM files WHERE lot_id=?':'SELECT COUNT(*) AS n FROM files WHERE request_id=?').get(lotId||requestId).n;must(currentCount<30,'묶음/거래당 최대 30개 파일입니다.');db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')")
replace('server/app.mjs', "basename(req.file.originalname).slice(0,150),mime", "displayName,mime")
replace('server/app.mjs', "{id,name:req.file.originalname,mime,kind}", "{id,name:displayName,mime,kind}")
replace('server/app.mjs', "{hash:f.sha256});res.json({ok:true});", "{hash:f.sha256,lotId:f.lot_id});res.json({ok:true});")
replace('src/types.ts', 'reviewerId?:string;evidence?', 'reviewerId?:string;reviewEligible?:boolean;evidence?')
replace('src/pages/LotDetail.tsx', "user.role==='REVIEWER'&&user.id!==lot.creatorId", "user.role==='REVIEWER'&&lot.reviewEligible")
replace('src/styles.css', '.no-print{display:block}', '')
replace('src/components/Shell.tsx', '<main id="main-content" className="main-content">', '<main id="main-content" className="main-content" tabIndex={-1}>')
print('Applied independent reviewer, immutable source, upload race, filename and layout hardening.')
