import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
if(process.env.NODE_ENV==='production'){console.error('운영 환경에서 데모 계정을 사용할 수 없습니다. npm start를 사용하세요.');process.exit(1);}
if(!existsSync('dist/index.html')){console.error('먼저 npm run build 를 실행하세요.');process.exit(1);}
const result=spawnSync(process.execPath,['server/index.mjs'],{stdio:'inherit',env:{...process.env,NODE_ENV:'development',DEMO_MODE:'true',DATA_DIR:process.env.DATA_DIR||'./data/demo',APP_ORIGIN:process.env.APP_ORIGIN||'http://localhost:4310',HOST:process.env.HOST||'127.0.0.1'}});process.exit(result.status??1);
