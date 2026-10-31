import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from '../server/db.mjs';
import {reserve} from '../server/service.mjs';
const db=openDatabase(workerData.path);parentPort.postMessage({ready:true});parentPort.once('message',()=>{try{reserve(db,workerData.user,workerData.id);parentPort.postMessage({ok:true});}catch(e){parentPort.postMessage({ok:false,code:e.code,message:e.message});}finally{db.close();}});
