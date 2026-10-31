import {restoreBackup} from './storage.mjs';
const [source,destination]=process.argv.slice(2);
try{
  if(!source||!destination)throw new Error('사용법: npm run restore -- <백업 경로> <존재하지 않는 새 DATA_DIR>');
  const result=restoreBackup(source,destination);
  console.log(`새 경로 복원 검증 완료: ${destination} | 첨부 ${result.files}개. 기존 DATA_DIR은 보존되었습니다. 로그인·기관 권한·증빙을 확인한 뒤 경로를 전환하세요.`);
}catch(error){console.error('복원 실패: '+error.message);process.exitCode=1;}
