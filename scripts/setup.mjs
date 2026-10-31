import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {randomBytes} from 'node:crypto';
import {openDatabase,uid,now} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
const db=openDatabase();
if(db.prepare('SELECT 1 FROM users LIMIT 1').get()){console.error('기존 DB에 계정이 있습니다. 초기화하지 않습니다. 웹 관리자 화면을 사용하세요.');db.close();process.exit(1);}
const rl=createInterface({input:stdin,output:stdout});
try{const name=(await rl.question('관리 기관명: ')).trim(),code=(await rl.question('기관코드: ')).trim(),district=(await rl.question('자치구: ')).trim(),email=(await rl.question('최초 운영관리자 이메일: ')).trim();if(!name||!code||!district||!email.includes('@'))throw new Error('필수 정보를 확인하세요.');const id=uid(),password=randomBytes(15).toString('base64url')+'!';db.prepare('INSERT INTO organizations VALUES(?,?,?,?,?,1,?,?)').run(id,name,code,'AFFILIATED',district,'최초 로컬 관리자 등록. 공식 기관 소속 확인은 운영 전 별도 필요.',now());addUser(db,{orgId:id,name:'운영관리자',email,password,role:'ADMIN'});console.log(`\n초기 관리자: ${email}\n임시 비밀번호: ${password}\n안전한 곳에 보관하고 로그인 후 비밀번호를 변경하세요. 운영관리자는 물품 검토자가 아닙니다.`);}finally{rl.close();db.close();}
