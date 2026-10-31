import {backup} from 'node:sqlite';
import {mkdirSync,cpSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {openDatabase} from '../server/db.mjs';
const source=resolve(process.env.DATA_DIR||'./data'),dest=resolve('backups',new Date().toISOString().replaceAll(':','-'));
mkdirSync(dest,{recursive:true,mode:0o700});const db=openDatabase(join(source,'trade.sqlite'));
try{await backup(db,join(dest,'trade.sqlite'));try{cpSync(join(source,'uploads'),join(dest,'uploads'),{recursive:true,errorOnExist:true,force:false});}catch(e){if(e.code!=='ENOENT')throw e;}writeFileSync(join(dest,'README.txt'),'DB 온라인 스냅샷+첨부 복사. 일관된 전체 백업을 위해 앱을 중지하고 실행하는 것을 권장합니다. 복원 전 앱을 중지하고 기존 경로를 보존하십시오. 자동 삭제/덮어쓰기는 하지 않습니다.');console.log(`백업 생성: ${dest}`);}finally{db.close();}
