import {resolve} from 'node:path';
import {verifyStorage} from './storage.mjs';
const failures=[];
function check(ok,message){console.log(`${ok?'통과':'미충족'}: ${message}`);if(!ok)failures.push(message);}
check(process.versions.node.split('.')[0]==='24','Node.js 24.x');
check(process.env.NODE_ENV==='production','NODE_ENV=production');
check(process.env.DEMO_MODE!=='true','데모 모드 비활성');
let origin;try{origin=new URL(process.env.APP_ORIGIN);}catch{}
check(!!origin&&origin.protocol==='https:'&&origin.origin===process.env.APP_ORIGIN,'정확한 HTTPS APP_ORIGIN 설정');
check(process.env.SECURE_COOKIE==='true','Secure 세션 쿠키');
check(!!process.env.DATA_DIR&&resolve(process.env.DATA_DIR)===process.env.DATA_DIR,'명시적인 절대 DATA_DIR (실제 영속 볼륨은 별도 확인)');
try{const info=verifyStorage(resolve(process.env.DATA_DIR||'./data'));check(info.users>0,'초기 운영 계정 존재');check(info.demoUsers===0,'시연 계정 없는 별도 운영 DB');check(true,`DB 무결성·참조·첨부 ${info.files}개 해시`);}catch(error){check(false,'저장소 검증: '+error.message);}
console.log('배포 대상 승인·실제 HTTPS 종단·영속 볼륨·별도 저장소 백업 및 복원 로그인은 담당자가 추가 확인해야 합니다. 이 명령은 배포하지 않습니다.');
if(failures.length)process.exitCode=1;
