import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createBackup} from './storage.mjs';
const source=resolve(process.env.DATA_DIR||'./data'),dest=resolve('backups',new Date().toISOString().replaceAll(':','-'));
try{mkdirSync('backups',{recursive:true,mode:0o700});const result=await createBackup(source,dest);console.log(`백업 검증 완료: ${dest} | 첨부 ${result.files}개`);}catch(error){console.error('백업 실패: '+error.message);process.exitCode=1;}
