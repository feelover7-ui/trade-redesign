import {unzipSync} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {posix} from 'node:path';
import {createHash} from 'node:crypto';
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,processEntities:false});
const asList=x=>x===undefined?[]:Array.isArray(x)?x:[x];
const relPath=p=>posix.join(posix.dirname(p),'_rels',posix.basename(p)+'.rels');
function target(from,to){
 if(typeof to!=='string'||/[:\\\0?#]/.test(to))return '';
 const p=posix.normalize(to.startsWith('/')?to.slice(1):posix.join(posix.dirname(from),to));
 return p.startsWith('xl/')&&!p.includes('../')?p:'';
}
/** Called only inside bounded spreadsheet worker, after archive-size checks. No external links. */
export function extractWorkbookImages(bytes,visibleSheets){
 if(Buffer.from(bytes).subarray(0,2).toString()!=='PK')return {images:[],warnings:['구형 XLS의 삽입 사진은 추출하지 않습니다. XLSX로 다시 저장하거나 사진을 따로 올리세요.']};
 const zip=unzipSync(bytes,{filter:f=>/^(xl\/.*\.xml(?:\.rels)?|xl\/.*\.rels|xl\/media\/[^/]+)$/.test(f.name)});
 const warnings=[],images=[];let total=0;
 const xml=p=>{
  if(!zip[p])return null;
  if(zip[p].length>4*1024*1024)throw new Error('이미지 관계 XML 크기 제한');
  const text=Buffer.from(zip[p]).toString('utf8');
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('안전하지 않거나 손상된 이미지 관계 XML');
  return parser.parse(text);
 };
 const relationships=p=>new Map(asList(xml(relPath(p))?.Relationships?.Relationship).filter(r=>r['@_TargetMode']!=='External').map(r=>[r['@_Id'],{type:r['@_Type']||'',path:target(p,r['@_Target'])}]));
 try{
  const book=xml('xl/workbook.xml'),bookRels=relationships('xl/workbook.xml');
  for(const s of asList(book?.workbook?.sheets?.sheet)){
   const sheetName=s['@_name'];if(!visibleSheets.includes(sheetName))continue;
   const sheetPath=bookRels.get(s['@_id'])?.path;if(!sheetPath)continue;
   const sheet=xml(sheetPath),sheetRels=relationships(sheetPath);
   for(const drawing of asList(sheet?.worksheet?.drawing)){
    const rel=sheetRels.get(drawing['@_id']);if(!rel?.type.endsWith('/drawing'))continue;
    const content=xml(rel.path)?.wsDr,rels=relationships(rel.path);
    if(content?.absoluteAnchor)warnings.push(`${sheetName}: 행 위치가 없는 사진은 자동 연결하지 않았습니다.`);
    for(const anchor of [...asList(content?.oneCellAnchor),...asList(content?.twoCellAnchor)]){
     const row=Number(anchor.from?.row)+1,col=Number(anchor.from?.col),endRow=Number(anchor.to?.row??anchor.from?.row)+1;
     if(!Number.isInteger(row)||row<1||row>2040||!Number.isInteger(col)||col<0||col>63)continue;
     const imageRel=rels.get(anchor.pic?.blipFill?.blip?.['@_embed']);
     if(!imageRel?.type.endsWith('/image')||!/^xl\/media\//.test(imageRel.path)||!zip[imageRel.path])continue;
     if(!/\.(png|jpe?g|webp)$/i.test(imageRel.path)){warnings.push(`${sheetName} ${row}행: 지원하지 않는 이미지 형식입니다.`);continue;}
     const data=zip[imageRel.path];
     if(images.length>=30||data.length>2*1024*1024||total+data.length>8*1024*1024){warnings.push('사진은 최대 30장·장당 2MB·총 8MB까지 후보로 가져옵니다. 나머지는 별도로 첨부하세요.');continue;}
     total+=data.length;
     images.push({sheet:sheetName,row,col,endRow,anchorExact:row===endRow,name:posix.basename(imageRel.path),sha256:createHash('sha256').update(data).digest('hex'),bytes:Buffer.from(data).toString('base64')});
    }
   }
  }
 }catch{warnings.push('삽입 사진 관계를 읽지 못했습니다. 표 데이터만 가져오며 사진을 별도로 올리세요.');}
 return {images,warnings:[...new Set(warnings)]};
}
