import {spawn} from 'node:child_process';
const env={...process.env,DEMO_MODE:process.env.DEMO_MODE||'true',DATA_DIR:process.env.DATA_DIR||'./data/demo',APP_ORIGIN:'http://localhost:5173'};
const server=spawn(process.execPath,['--watch','server/index.mjs'],{stdio:'inherit',env});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',env});
const stop=()=>{server.kill();vite.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);server.on('exit',code=>{vite.kill();process.exit(code??0);});
