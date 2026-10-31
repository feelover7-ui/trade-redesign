import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,cpSync,existsSync,readFileSync,writeFileSync,readdirSync,lstatSync,chmodSync} from 'node:fs';
import {resolve,join,basename,relative,isAbsolute} from 'node:path';

const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function regular(file){if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())throw new Error('일반 파일만 허용합니다: '+basename(file));}
function uploadFiles(dir){
  if(!existsSync(dir))return [];
  if(lstatSync(dir).isSymbolicLink()||!lstatSync(dir).isDirectory())throw new Error('첨부 경로는 실제 디렉터리여야 합니다.');
  return readdirSync(dir).sort().map(name=>{regular(join(dir,name));return name;});
}
export function verifyStorage(source){
  const file=join(source,'trade.sqlite');regular(file);
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('SQLite 무결성 검사 실패');
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite 참조 무결성 검사 실패');
    const files=db.prepare('SELECT disk_name,sha256 FROM files').all();
    for(const f of files){
      if(f.disk_name!==basename(f.disk_name))throw new Error('첨부 경로가 올바르지 않습니다.');
      const path=join(source,'uploads',f.disk_name);regular(path);
      if(digest(path)!==f.sha256)throw new Error('첨부 해시 불일치: '+f.disk_name);
    }
    return {files:files.length,users:db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      demoUsers:db.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@demo.local'").get().n};
  }finally{db.close();}
}
export async function createBackup(source,destination){
  source=resolve(source);destination=resolve(destination);
  // Read-only validation must happen before creating anything. Never initialize an absent DB.
  verifyStorage(source);uploadFiles(join(source,'uploads'));
  const rel=relative(source,destination);
  if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))throw new Error('백업은 DATA_DIR 밖의 새 경로를 사용하세요.');
  mkdirSync(destination,{mode:0o700});
  const db=new DatabaseSync(join(source,'trade.sqlite'),{readOnly:true});
  try{await backup(db,join(destination,'trade.sqlite'));}finally{db.close();}
  chmodSync(join(destination,'trade.sqlite'),0o600);
  if(existsSync(join(source,'uploads')))cpSync(join(source,'uploads'),join(destination,'uploads'),{recursive:true,errorOnExist:true,force:false});
  const result=verifyStorage(destination);
  const paths=['trade.sqlite',...uploadFiles(join(destination,'uploads')).map(n=>'uploads/'+n)];
  const manifest={version:1,createdAt:new Date().toISOString(),files:Object.fromEntries(paths.map(p=>[p,digest(join(destination,p))]))};
  writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  writeFileSync(join(destination,'README.txt'),'DB 및 첨부 SHA-256 검증 백업. 전체 일관성을 위해 앱을 중지하고 실행하세요. npm run restore -- <백업 경로> <존재하지 않는 새 DATA_DIR>로 검증 후 복원합니다. 원본/기존 경로는 덮어쓰지 않습니다.',{mode:0o600,flag:'wx'});
  return result;
}
export function restoreBackup(source,destination){
  source=resolve(source);destination=resolve(destination);
  if(existsSync(destination))throw new Error('복원 대상이 이미 존재합니다. 기존 데이터를 보존하고 새 경로를 지정하세요.');
  const manifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
  if(manifest.version!==1||!manifest.files||!manifest.files['trade.sqlite'])throw new Error('지원하는 백업 검증표가 없습니다.');
  const expected=['trade.sqlite',...uploadFiles(join(source,'uploads')).map(n=>'uploads/'+n)].sort();
  if(JSON.stringify(Object.keys(manifest.files).sort())!==JSON.stringify(expected))throw new Error('백업 파일 목록이 다릅니다.');
  for(const p of expected){regular(join(source,p));if(digest(join(source,p))!==manifest.files[p])throw new Error('백업 해시 불일치: '+p);}
  const result=verifyStorage(source);
  mkdirSync(destination,{mode:0o700});
  cpSync(join(source,'trade.sqlite'),join(destination,'trade.sqlite'),{errorOnExist:true,force:false});
  if(existsSync(join(source,'uploads')))cpSync(join(source,'uploads'),join(destination,'uploads'),{recursive:true,errorOnExist:true,force:false});
  verifyStorage(destination);
  return result;
}
