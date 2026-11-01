import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import sharp from 'sharp';
import {must} from './db.mjs';
import {safeReferenceUrl} from './providers.mjs';
function publicIPv4(ip){const n=ip.split('.').map(Number);return n.length===4&&n.every(v=>Number.isInteger(v)&&v>=0&&v<=255)&&![0,10,127].includes(n[0])&&n[0]<224&&!(n[0]===169&&n[1]===254)&&!(n[0]===172&&n[1]>=16&&n[1]<=31)&&!(n[0]===192&&(n[1]===168||n[1]===0))&&!(n[0]===100&&n[1]>=64&&n[1]<=127)&&!(n[0]===198&&[18,19].includes(n[1]));}
export async function referenceImage(value){
 must(safeReferenceUrl(value),'공식 참고사진 주소가 아닙니다.',400);const url=new URL(value),resolved=await lookup(url.hostname,{family:4});must(publicIPv4(resolved.address),'내부망 이미지 주소는 허용하지 않습니다.',400);
 // Pin the checked DNS result; no automatic redirects and no arbitrary client URLs.
 const data=await new Promise((resolve,reject)=>{
  const req=request(url,{lookup:(_host,opts,cb)=>opts?.all?cb(null,[resolved]):cb(null,resolved.address,4),timeout:10000,headers:{Accept:'image/jpeg,image/png,image/webp'}},res=>{
   if(res.statusCode!==200){res.resume();return reject(new Error('참고사진 응답을 확인할 수 없습니다.'));}
   let size=0;const chunks=[];res.on('data',part=>{size+=part.length;if(size>4*1024*1024){req.destroy(new Error('참고사진 크기 제한'));return;}chunks.push(part);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
  });req.on('timeout',()=>req.destroy(new Error('참고사진 시간 제한')));req.on('error',reject);req.end();
 });
 const image=sharp(data,{limitInputPixels:16000000});const meta=await image.metadata();must(['jpeg','png','webp'].includes(meta.format),'안전한 이미지 형식만 표시합니다.');return image.rotate().resize({width:1000,height:1000,fit:'inside',withoutEnlargement:true}).webp().toBuffer();
}
