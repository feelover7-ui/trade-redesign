import {defineConfig} from '@playwright/test';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';

// Never reuse the demonstration/production server or an earlier run's database.
const port=Number(process.env.E2E_PORT||4311);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('E2E_PORT must be between 1024 and 65535');
const baseURL=`http://localhost:${port}`;
mkdirSync('data',{recursive:true});
const dataDir=mkdtempSync(resolve('data','e2e-'));
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:60000,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL,viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'npm run demo',url:baseURL+'/api/health',reuseExistingServer:false,timeout:45000,
    env:{DATA_DIR:dataDir,HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:baseURL,NODE_ENV:'development',SECURE_COOKIE:'false'}},
  projects:[{name:'chromium',use:{browserName:'chromium',...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})}}]
});
