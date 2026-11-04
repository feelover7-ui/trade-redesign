/** Native, bounded reader for unpassworded OZP 3.0.0.1 / K-Edufine demand lists.
 * Independent implementation of observed file structures, NOT vendor runtime code.
 * PC1 algorithm: Alexandre Pukall (1991), freely usable with author attribution.
 * No report scripts, executable objects, external references or SDKs are executed.
 */
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as XLSX from 'xlsx';
export const PARSER_VERSION='ozp3-demand-v1';
const MAX_INPUT=8*1024*1024,MAX_ENTRY=8*1024*1024,MAX_TOTAL=32*1024*1024;
const UTF8=new TextDecoder('utf-8',{fatal:true}),UTF16=new TextDecoder('utf-16le',{fatal:true});
export function nativeError(code,message){return Object.assign(new Error(message),{code,status:422});}
function check(ok,code='OZD_NATIVE_INVALID',message='OZD 내부 구조가 손상되었거나 지원하지 않는 형식입니다. 원본은 보존됩니다.'){if(!ok)throw nativeError(code,message);}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** PC1 stream transform for the format's no-password envelope only. Not password recovery. */
function openEnvelope(bytes){
 const key=Buffer.alloc(16);key.write('FORCS_OZPROJECT','ascii');let carry=0,previous=0;
 function decode(input){const output=Buffer.alloc(input.length);for(let pos=0;pos<input.length;pos++){
  let chain=0,mask=0;
  for(let pair=0;pair<8;pair++){
   chain^=(key[pair*2]<<8)|key[pair*2+1];
   carry=((carry+pair)*20021+chain*346+previous)&0xffff;
   previous=(chain*346)&0xffff;
   chain=((chain*20021)&0xffff)+1;mask^=chain^carry;
  }
  const plain=(input[pos]^(mask>>>8)^(mask&255))&255;output[pos]=plain;
  for(let k=0;k<16;k++)key[k]^=plain;
 }return output;}
 const magic=decode(bytes.subarray(0,11)).toString('ascii');
 check(magic==='dkanehahffk'||magic==='dkanehahffz');
 carry=0;previous=0;
 return magic==='dkanehahffz'?Buffer.from(bytes.subarray(11)):decode(bytes.subarray(11));
}
export function readOzpEntries(input){
 const bytes=Buffer.from(input);check(bytes.length>=10&&bytes.length<=MAX_INPUT,'OZD_NATIVE_SIZE','OZD 파일은 8MB 이하의 정상 원본이어야 합니다.');
 check(bytes.subarray(0,3).toString()==='OZP');
 check(bytes.subarray(3,7).equals(Buffer.from([3,0,0,1])),'OZD_NATIVE_UNSUPPORTED','이 OZD 버전은 아직 직접 변환을 지원하지 않습니다. 원본을 보존했습니다.');
 const length=bytes.readUInt16LE(7);check(length<=1024&&10+length+11<bytes.length&&bytes[9]===0);
 check(bytes.subarray(10,10+length).toString('utf8')==='NoPassword_Entered','OZD_NATIVE_PASSWORD','비밀번호가 설정된 OZD는 직접 변환하지 않습니다. 비밀번호 없는 원본이 필요합니다.');
 const body=openEnvelope(bytes.subarray(10+length));check(body.length>=8);
 const start=body.readUInt32LE(0),count=body.readUInt32LE(4);
 check(count>0&&count<=128&&start===8+count*532&&start<body.length);
 const entries=[],names=new Set(),ranges=[];
 for(let i=0;i<count;i++){
  const p=8+i*532,n=body.readUInt32LE(p);check(n>0&&n<=520&&n%2===0);
  const allName=body.subarray(p+4,p+524);let name;try{name=UTF16.decode(allName).replace(/\0+$/,'');}catch{check(false);}
  check(name&&!name.includes('\0')&&!name.split(/[\\/]/).includes('..')&&!names.has(name));names.add(name);
  const offset=body.readUInt32LE(p+524),size=body.readUInt32LE(p+528);
  check(size>=18&&offset+size<=body.length-start);ranges.push([offset,offset+size]);
  entries.push({name,compressed:body.subarray(start+offset,start+offset+size)});
 }
 ranges.sort((a,b)=>a[0]-b[0]);check(ranges[0][0]===0&&ranges.at(-1)[1]===body.length-start);
 for(let i=1;i<ranges.length;i++)check(ranges[i][0]===ranges[i-1][1]);
 return entries;
}
class Reader{
 constructor(bytes){this.bytes=bytes;this.position=0;}
 take(n){check(Number.isInteger(n)&&n>=0&&this.position+n<=this.bytes.length);const b=this.bytes.subarray(this.position,this.position+n);this.position+=n;return b;}
 int(){return this.take(4).readInt32BE(0);}
 byte(){return this.take(1)[0];}
 flag(){const n=this.byte();check(n===0||n===1);return n===1;}
 utf(){const n=this.take(2).readUInt16BE(0);check(n<=16384);try{return UTF8.decode(this.take(n));}catch(e){if(e.code)throw e;throw nativeError('OZD_NATIVE_ENCODING','OZD 한글 문자의 인코딩을 확인할 수 없습니다. 임의 복원하지 않습니다.');}}
 bounded(max){const n=this.int();check(n>=0&&n<=max);return n;}
}
/** Strict ByteArraySet framing. Offsets, row lengths and field boundaries must all agree. */
export function readDemandModule(bytes){
 const r=new Reader(bytes);const chars=r.bounded(8192);const descriptor=r.take(chars*2);
 check(descriptor.length%2===0&&r.byte()===1);check(r.utf()==='OZBINDEDDATAMODULE');
 const version=r.int();check(version===2040,'OZD_NATIVE_UNSUPPORTED','이 OZD 데이터 버전은 아직 직접 변환을 지원하지 않습니다.');
 r.utf();check(r.int()===0);const setCount=r.bounded(32);check(setCount>0);
 const sets=[];let totalRows=0,totalFields=0;
 for(let k=0;k<setCount;k++){
  const name=r.utf();check(name.length<=256&&name.length>0);check(r.utf()==='ByteArraySet');r.utf();
  const fieldCount=r.bounded(64);check(fieldCount>0);totalFields+=fieldCount;check(totalFields<=512);
  const fields=[],seen=new Set();
  for(let j=0;j<fieldCount;j++){
   check(r.int()===1);const type=r.int();check(type===12||type===2,'OZD_NATIVE_UNSUPPORTED','직접 변환에서 지원하지 않는 OZD 셀 형식입니다. 일부 값만 추측해 등록하지 않습니다.');
   const column=r.utf();check(/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(column)&&!seen.has(column));seen.add(column);r.flag();fields.push({name:column,type});
  }
  check(r.int()===0);const instanceCount=r.bounded(32),instances=[];
  for(let j=0;j<instanceCount;j++){
   const poolSize=r.bounded(MAX_ENTRY),rowCount=r.bounded(2001);r.utf();totalRows+=rowCount;check(totalRows<=2064);instances.push({poolSize,rowCount});
  }
  sets.push({name,fields,instances});
 }
 const poolSize=r.bounded(MAX_ENTRY),ranges=[];
 for(const set of sets)for(const part of set.instances){
  check(part.poolSize===poolSize);part.index=[];
  for(let i=0;i<part.rowCount;i++){
   const length=r.bounded(MAX_ENTRY),offset=r.bounded(MAX_ENTRY);check(length>0&&offset+length<=poolSize);part.index.push({length,offset});ranges.push([offset,offset+length]);
  }
 }
 const pool=r.take(poolSize);check(r.position===bytes.length);ranges.sort((a,b)=>a[0]-b[0]);
 check(ranges.length&&ranges[0][0]===0&&ranges.at(-1)[1]===poolSize);for(let i=1;i<ranges.length;i++)check(ranges[i][0]===ranges[i-1][1]);
 const matched=[];
 for(const set of sets){
  const names=new Set(set.fields.map(f=>f.name));const isDemand=names.has('THNG_NM')&&names.has('REQRE_INQIRE_QTY');
  if(isDemand)check(names.has('THNG_CL_CD')&&names.has('THNG_IDNTFC_CD'),'OZD_NATIVE_UNSUPPORTED','소요조회 표의 물품번호 열을 확인할 수 없습니다.');
  const rows=[];
  for(const part of set.instances)for(const index of part.index){
   const row=new Reader(pool.subarray(index.offset,index.offset+index.length)),values=Object.create(null);
   for(const field of set.fields)values[field.name]=field.type===12?(row.flag()?null:row.utf()):row.utf();
   check(row.position===index.length);
   if(isDemand)rows.push(values);
  }
  if(isDemand)matched.push({name:set.name,rows});
 }
 return matched;
}
function normalizeDemand(row){
 const classification=row.THNG_CL_CD??'',identification=row.THNG_IDNTFC_CD??'',name=row.THNG_NM??'';
 check((classification===''||/^\d{8}$/.test(classification))&&(identification===''||/^\d{8}$/.test(identification)),'OZD_NATIVE_ROW_INVALID','OZD의 물품번호가 8자리 형식과 다릅니다. 원본 번호를 확인하세요.');
 check(name.trim().length>=2&&name.length<=2000,'OZD_NATIVE_ROW_INVALID','OZD의 물품명이 비어 있거나 너무 깁니다.');
 const qty=row.REQRE_INQIRE_QTY;
 check(typeof qty==='string'&&/^\d{1,6}$/.test(qty)&&Number(qty)<=100000,'OZD_NATIVE_ROW_INVALID','OZD 등록수량을 정확한 정수로 읽지 못했습니다. 일부 물품을 누락하지 않고 중단했습니다.');
 // Never infer condition, manufacturer, asset IDs or official approval from product codes.
 return [classification&&identification?classification+'-'+identification:'',name,Number(qty),row.ACQS_DTE??'',row.ACQS_UNTPC??'',row.THNG_STS_NM??'',row.REQRE_INQIRE_REQST_QTY??'',classification,identification];
}
export function convertNativeOzd(input){
 const entries=readOzpEntries(input);let total=0;const tables=[];
 for(const entry of entries){
  if(!/\.o~j$/i.test(entry.name))continue;
  let data;try{data=gunzipSync(entry.compressed,{maxOutputLength:MAX_ENTRY});}catch{throw nativeError('OZD_NATIVE_INVALID','OZD 데이터의 압축 무결성 검사에 실패했습니다. 손상된 값을 등록하지 않습니다.');}
  total+=data.length;check(total<=MAX_TOTAL);
  tables.push(...readDemandModule(data).map(t=>({...t,entry:entry.name})));
 }
 check(tables.length===1,'OZD_NATIVE_UNSUPPORTED',tables.length?'여러 소요조회 표가 포함돼 자동 병합하지 않았습니다. 표별 확인이 필요합니다.':'지원하는 소요조회 물품 표를 찾지 못했습니다. 이 형식은 아직 직접 변환하지 않습니다.');
 const table=tables[0];check(table.rows.length>0&&table.rows.length<=2000,'OZD_NATIVE_ROW_LIMIT','OZD 소요조회 표는 1~2,000행이어야 합니다.');
 const rows=table.rows.map(normalizeDemand),headers=['G2B목록번호','G2B목록명','등록수량','취득일자','취득단가','물품상태','신청수량','물품분류번호','물품식별번호'];
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
 sheet['!cols']=[{wch:23},{wch:70},{wch:12},{wch:14},{wch:16},{wch:12},{wch:12},{wch:16},{wch:16}];sheet['!autofilter']={ref:sheet['!ref']};
 for(let i=1;i<=rows.length;i++)for(const j of [0,3,4,5,6,7,8]){const cell=sheet[XLSX.utils.encode_cell({r:i,c:j})];if(cell){cell.t='s';cell.v=String(cell.v??'');cell.z='@';delete cell.f;}}
 XLSX.utils.book_append_sheet(book,sheet,'소요조회물품목록');
 const bytes=Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}));check(bytes.length<=MAX_INPUT,'OZD_NATIVE_SIZE','변환된 엑셀 크기가 허용 범위를 초과했습니다.');
 return {bytes,method:'NATIVE_OZP3_DEMAND',inputHash:hash(input),outputHash:hash(bytes),summary:{parser:PARSER_VERSION,rows:rows.length,totalQuantity:rows.reduce((n,r)=>n+r[2],0),dataset:table.name,sourceEntry:table.entry,columns:headers,externalProgram:false},warnings:['OZD 내부 소요조회 데이터를 직접 변환했습니다. 원본 상태·단가·행을 보존하며 서식 배치·이미지·보고서 스크립트는 변환하지 않습니다.']};
}
