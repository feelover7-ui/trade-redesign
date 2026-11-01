import * as XLSX from 'xlsx';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';

export const IMPORT_FIELDS = [
 ['externalId','기관 자산번호',['자산번호','물품관리번호','관리번호','물품고유번호','자산관리번호']],
 ['originalName','대장 품명',['대장품명','물품명','품명','품목명','물품품명']],
 ['quantity','수량',['수량','보유수량','전환수량','불용수량','관리전환수량']],
 ['classificationCode','물품분류번호',['물품분류번호','분류번호','세부물품분류번호','세부품명번호']],
 ['identificationCode','물품식별번호',['물품식별번호','식별번호','조달물품식별번호']],
 ['specification','규격 / 모델',['규격','모델명','모델','품목규격']],
 ['acquiredDate','취득일',['취득일','취득일자','취득년월일']],
 ['acquiredPrice','취득금액',['취득금액','취득가격','장부가액','장부가격']],
 ['decisionRef','불용결정 문서번호',['불용결정번호','불용결정문서번호','결정문서번호']],
 ['decisionDate','불용결정일',['불용결정일','불용일자','불용결정일자']],
 ['account','회계 / 소관',['회계','회계구분','소관회계','소관']],
 ['condition','기재된 상태 (참고)',['상태','물품상태','물품상태구분']]
];
const norm=s=>String(s??'').normalize('NFKC').replace(/[\s()（）_*·.\-\/]/g,'').toLowerCase();
function err(message){throw new Error(message);}
/** Bound ZIP expansion before passing untrusted XLSX bytes to the isolated parser. */
function guardArchive(bytes){
 const isZip=bytes.subarray(0,2).toString()==='PK',isOle=bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'));
 if(!isZip&&!isOle)err('실제 XLSX 또는 XLS 파일을 선택하세요. HTML을 엑셀로 저장한 파일은 XLSX로 다시 저장하세요.');
 if(!isZip)return;
 let total=0,count=0;
 for(let i=0;i+46<bytes.length;i++)if(bytes.readUInt32LE(i)===0x02014b50){
   const size=bytes.readUInt32LE(i+24),nameLen=bytes.readUInt16LE(i+28),extra=bytes.readUInt16LE(i+30),comment=bytes.readUInt16LE(i+32);
   if(size===0xffffffff||i+46+nameLen+extra+comment>bytes.length)err('지원하지 않는 ZIP64/손상된 엑셀 파일입니다.');
   const name=bytes.subarray(i+46,i+46+nameLen).toString();
   if(/vbaProject\.bin$/i.test(name))err('매크로 포함 파일은 지원하지 않습니다. 매크로 없는 XLSX로 저장하세요.');
   total+=size;count++;if(total>48*1024*1024||count>3000)err('압축 해제 크기가 너무 큽니다. 필요한 시트만 따로 저장하세요.');
   i+=45+nameLen+extra+comment;
 }
 if(!count)err('엑셀 압축 구조를 확인할 수 없습니다. 파일을 다시 저장하세요.');
}
export function parseWorkbook(bytes){
 bytes=Buffer.from(bytes);if(bytes.length>8*1024*1024)err('엑셀은 8MB 이하로 선택하세요.');guardArchive(bytes);
 const wb=XLSX.read(bytes,{type:'buffer',cellFormula:true,cellHTML:false,cellNF:true,cellText:true,cellDates:false,bookVBA:false,sheetRows:2040});
 if(wb.SheetNames.length>20)err('최대 20개 시트까지 지원합니다.');
 const sheets=wb.SheetNames.filter((_,i)=>!wb.Workbook?.Sheets?.[i]?.Hidden).map(name=>{
   const ws=wb.Sheets[name],ref=ws['!fullref']||ws['!ref'];if(!ref)return {name,rows:[],suggestedHeader:1,mapping:{},columns:0};
   const range=XLSX.utils.decode_range(ref);if(range.e.r>=2039||range.e.c>=64)err(`${name}: 2,000개 데이터 행·64개 열 이내로 정리하세요.`);
   const rows=[];
   for(let r=0;r<=range.e.r;r++){
     const cells=[];
     for(let c=0;c<=range.e.c;c++){
       const cell=ws[XLSX.utils.encode_cell({r,c})];
       if(!cell){cells.push({text:'',value:null});continue;}
       const value=typeof cell.v==='string'?cell.v.slice(0,2000):cell.v??null;
       const text=String(cell.w??value??'').slice(0,2000);
       let date='';if(cell.t==='n'&&XLSX.SSF.is_date(cell.z||'')){
         const d=XLSX.SSF.parse_date_code(cell.v,{date1904:!!wb.Workbook?.WBProps?.date1904});
         if(d)date=`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
       }
       cells.push({text,value,...(cell.f?{formula:String(cell.f).slice(0,1000)}:{}),...(date?{date}:{})});
     }
     rows.push(cells);
   }
   let best={score:0,row:0,mapping:{}};
   for(let r=0;r<Math.min(30,rows.length);r++){
     const mapping={};
     for(const [key,,aliases]of IMPORT_FIELDS){const indices=rows[r].flatMap((cell,c)=>aliases.some(a=>norm(a)===norm(cell.text))?[c]:[]);if(indices.length===1)mapping[key]=indices[0];}
     const score=Object.keys(mapping).length+(mapping.originalName!==undefined?3:0)+(mapping.quantity!==undefined?3:0);
     if(score>best.score)best={score,row:r,mapping};
   }
   return {name,rows,suggestedHeader:best.row+1,mapping:best.mapping,columns:range.e.c+1};
 });
 if(!sheets.some(s=>s.rows.length>1))err('가져올 표가 없습니다. 숨김 시트는 가져오지 않습니다.');
 const result={sheets};if(JSON.stringify(result).length>4*1024*1024)err('본문이 너무 큽니다. 불필요한 열을 제거하세요.');return result;
}
export function parseWorkbookIsolated(bytes){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL(import.meta.url),{workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:192},execArgv:[]});
 const timer=setTimeout(()=>{void worker.terminate();reject(new Error('엑셀 분석 제한시간을 넘었습니다. 작은 파일로 나누세요.'));},15000);
 worker.once('message',r=>{clearTimeout(timer);r.error?reject(new Error(r.error)):resolve(r.data);});
 worker.once('error',()=>{clearTimeout(timer);reject(new Error('엑셀을 안전하게 읽지 못했습니다. 파일을 확인하세요.'));});
 worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('엑셀 분석이 중단되었습니다. 파일 크기/형식을 확인하세요.'));});
});}
if(!isMainThread){try{parentPort.postMessage({data:parseWorkbook(workerData)});}catch(e){parentPort.postMessage({error:e.message});}}
