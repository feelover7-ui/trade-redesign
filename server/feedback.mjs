import multer from 'multer';
import sharp from 'sharp';
import {z} from 'zod';
import {join,extname} from 'node:path';
import {writeFileSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {uid,now,must,audit,transaction} from './db.mjs';
import {hash,requireRole} from './auth.mjs';
import {normalizeUploadName} from './file-names.mjs';

const inputSchema=z.object({
  title:z.string().trim().min(2,'제목은 2자 이상 입력하세요.').max(100),
  category:z.enum(['FEATURE','BUG','USABILITY','OTHER']),
  body:z.string().trim().min(10,'내용은 10자 이상 입력하세요.').max(5000),
  page:z.string().trim().max(200).default(''),
  requestKey:z.string().uuid()
}).strict();
const updateSchema=z.object({status:z.enum(['RECEIVED','REVIEWING','DONE','DEFERRED']),reply:z.string().trim().max(5000),version:z.number().int().positive()}).strict();
const officeSignatures=new Set(['.hwp','.xls']);
const zipDocuments=new Set(['.hwpx','.xlsx','.docx','.pptx','.zip']);

export function feedbackRow(db,user,id){
  const row=db.prepare('SELECT * FROM feedback WHERE id=?').get(id);
  must(row&&(row.user_id===user.id||user.role==='ADMIN'),'개선사항을 찾을 수 없거나 접근 권한이 없습니다.',404);
  return row;
}
export function feedbackFileAccess(db,user,fileId){
  const row=db.prepare('SELECT f.user_id FROM feedback_attachments a JOIN feedback f ON f.id=a.feedback_id WHERE a.file_id=?').get(fileId);
  return row?row.user_id===user.id||user.role==='ADMIN':null;
}

/** Re-encode images; documents are downloaded, never executed or parsed into business data. */
export async function prepareFeedbackFile(file){
  const name=normalizeUploadName(file.originalname),ext=extname(name).toLowerCase(),input=file.buffer;
  must(input.length>0&&input.length<=8*1024*1024,'첨부는 비어 있지 않은 8MB 이하 파일을 선택하세요.');
  must(!['.heic','.heif'].includes(ext),'HEIC·HEIF 사진은 JPEG로 변환한 뒤 첨부하세요.');
  if(['.jpg','.jpeg','.png','.webp'].includes(ext)){
    try{
      const image=sharp(input,{limitInputPixels:24000000}),meta=await image.metadata();
      must(['jpeg','png','webp'].includes(meta.format),'JPG·PNG·WebP 사진만 첨부할 수 있습니다.');
      const bytes=await image.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();
      return {name,mime:'image/webp',ext:'webp',bytes};
    }catch(error){if(error.status)throw error;must(false,'사진을 읽을 수 없습니다. HEIC·HEIF는 JPEG로 변환하세요.');}
  }
  let mime='application/octet-stream',valid=false;
  if(ext==='.pdf'){valid=input.subarray(0,5).toString()==='%PDF-';mime='application/pdf';}
  else if(officeSignatures.has(ext))valid=input.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'));
  else if(zipDocuments.has(ext))valid=input.subarray(0,4).equals(Buffer.from('504b0304','hex'))||input.subarray(0,4).equals(Buffer.from('504b0506','hex'));
  else if(['.txt','.csv'].includes(ext)){
    // Legacy Korean text is allowed as a download, but binary/HTML disguises are not.
    valid=!input.includes(0)&&!/<\s*(?:!doctype\s+html|html|script|svg)\b/i.test(input.subarray(0,1024).toString());
    mime='application/octet-stream';
  }
  must(valid,'지원하지 않거나 형식이 맞지 않는 파일입니다. 사진, PDF, 한글, 엑셀, DOCX/PPTX, TXT/CSV, ZIP을 선택하세요.');
  return {name,mime,ext:ext.slice(1),bytes:input};
}

export function saveFeedback(db,user,input,files,uploadDir){
  const d=inputSchema.parse(input);
  must(files.length<=5,'첨부파일은 최대 5개입니다.');
  const payloadHash=hash(JSON.stringify({data:{title:d.title,category:d.category,body:d.body,page:d.page},files:files.map(f=>({name:f.name,hash:hash(f.bytes)}))}));
  const written=[];
  try{return transaction(db,()=>{
    const prior=db.prepare('SELECT id,payload_hash FROM feedback WHERE user_id=? AND request_key=?').get(user.id,d.requestKey);
    if(prior){must(prior.payload_hash===payloadHash,'동일한 접수 요청의 내용이 달라졌습니다. 등록 내역을 확인하세요.',409);return {id:prior.id,reused:true};}
    const count=db.prepare('SELECT COUNT(*) n FROM feedback WHERE user_id=? AND created_at>?').get(user.id,new Date(Date.now()-3600000).toISOString()).n;
    must(count<20,'시간당 최대 20건까지 접수할 수 있습니다. 잠시 후 다시 등록하세요.',429);
    const id=uid(),time=now();
    db.prepare('INSERT INTO feedback(id,org_id,user_id,title,category,body,page,request_key,payload_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,user.org_id,user.id,d.title,d.category,d.body,d.page,d.requestKey,payloadHash,time,time);
    for(const file of files){
      const fileId=uid(),diskName=fileId+'.'+file.ext,path=join(uploadDir,diskName);
      const fd=openSync(path,'wx',0o600);written.push(path);
      try{writeFileSync(fd,file.bytes);}finally{closeSync(fd);}
      db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(fileId,user.org_id,null,null,'EVIDENCE',file.name,file.mime,diskName,hash(file.bytes),file.bytes.length,user.id,time);
      db.prepare('INSERT INTO feedback_attachments VALUES(?,?)').run(id,fileId);
    }
    audit(db,user,'FEEDBACK_CREATE',id,{category:d.category,attachments:files.length});
    return {id,reused:false};
  });}catch(error){for(const path of written){try{unlinkSync(path);}catch{ /* Retain the original failure; never remove an existing attachment. */ }}throw error;}
}

export function mountFeedback(app,db,{uploadDir}){
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:5,fields:5,fieldSize:24000,parts:10}});
  app.get('/api/feedback',(req,res)=>{
    const admin=req.user.role==='ADMIN';
    const rows=db.prepare(`SELECT f.id,f.title,f.category,f.status,f.created_at,f.updated_at,u.name AS author_name,o.name AS org_name,
      (SELECT COUNT(*) FROM feedback_attachments a WHERE a.feedback_id=f.id) AS attachment_count
      FROM feedback f JOIN users u ON u.id=f.user_id JOIN organizations o ON o.id=f.org_id
      ${admin?'':'WHERE f.user_id=?'} ORDER BY f.created_at DESC,f.id LIMIT 100`).all(...(admin?[]:[req.user.id]));
    res.json(rows);
  });
  app.post('/api/feedback',upload.array('files',5),async(req,res)=>{
    const input=inputSchema.parse(req.body),files=[];
    for(const file of req.files||[])files.push(await prepareFeedbackFile(file));
    res.status(201).json(saveFeedback(db,req.user,input,files,uploadDir));
  });
  app.get('/api/feedback/:id',(req,res)=>{
    const row=feedbackRow(db,req.user,req.params.id);
    const author=db.prepare('SELECT u.name,o.name AS org_name FROM users u JOIN organizations o ON o.id=u.org_id WHERE u.id=?').get(row.user_id);
    const attachments=db.prepare('SELECT f.id,f.name,f.mime,f.size FROM files f JOIN feedback_attachments a ON a.file_id=f.id WHERE a.feedback_id=? ORDER BY f.created_at,f.id').all(row.id);
    res.json({id:row.id,title:row.title,category:row.category,body:row.body,page:row.page,status:row.status,reply:row.reply,version:row.version,created_at:row.created_at,updated_at:row.updated_at,author_name:author.name,org_name:author.org_name,attachments});
  });
  app.patch('/api/feedback/:id',(req,res)=>{
    requireRole(req.user,'ADMIN');const d=updateSchema.parse(req.body);
    transaction(db,()=>{const row=feedbackRow(db,req.user,req.params.id);must(row.version===d.version,'다른 관리자가 먼저 변경했습니다. 새로고침 후 확인하세요.',409);
      db.prepare('UPDATE feedback SET status=?,reply=?,responded_by=?,version=version+1,updated_at=? WHERE id=?').run(d.status,d.reply,req.user.id,now(),row.id);
      audit(db,req.user,'FEEDBACK_REVIEW',row.id,{status:d.status});});res.json({ok:true});
  });
  app.get('/api/feedback/:id/attachments/:fileId/preview',(req,res)=>{
    feedbackRow(db,req.user,req.params.id);
    const f=db.prepare("SELECT f.disk_name FROM files f JOIN feedback_attachments a ON a.file_id=f.id WHERE a.feedback_id=? AND f.id=? AND f.mime='image/webp'").get(req.params.id,req.params.fileId);
    must(f,'사진을 찾을 수 없습니다.',404);res.type('image/webp').sendFile(join(uploadDir,f.disk_name));
  });
}
