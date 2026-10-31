import {basename} from 'node:path';
export function normalizeUploadName(input){let name=String(input||'attachment');if([...name].every(c=>c.charCodeAt(0)<=255)){const decoded=Buffer.from(name,'latin1').toString('utf8');if(!decoded.includes('\uFFFD'))name=decoded;}return basename(name.replaceAll('\\','/')).normalize('NFC').replace(/[\x00-\x1f\x7f]/g,'').slice(0,150)||'attachment';}
