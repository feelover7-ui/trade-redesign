import {z} from 'zod';
import {parseCatalogName} from './catalog-name.mjs';
import * as XLSX from 'xlsx';
import {splitListingNumber} from './catalog-identifiers.mjs';
import {uid,now,must,audit,transaction} from './db.mjs';
import {hash} from './auth.mjs';
import {assetSchema} from './validation.mjs';
import {business,saveLot,importAssets,bindAssets} from './service.mjs';
import {IMPORT_FIELDS} from './excel-parser.mjs';

const configSchema=z.object({sheet:z.string().min(1).max(100),headerRow:z.number().int().min(1).max(30),mapping:z.record(z.string(),z.number().int().min(0).max(63)),groupIdentical:z.boolean().default(false),department:z.string().trim().max(100).default('')});
export function storeImport(db,user,name,bytes,workbook){business(user);const id=uid();db.prepare('INSERT INTO import_batches VALUES(?,?,?,?,?,?,?)').run(id,user.org_id,user.id,hash(bytes),name,JSON.stringify({...workbook,images:undefined}),now());audit(db,user,'EXCEL_PREVIEW',id,{fileHash:hash(bytes),name});return id;}
export function loadImport(db,user,id){business(user);const b=db.prepare('SELECT * FROM import_batches WHERE id=? AND org_id=?').get(id,user.org_id);must(b,'본 기관의 업로드를 찾을 수 없습니다.',404);must(Date.now()-Date.parse(b.created_at)<86400000,'미리보기가 만료되었습니다. 원본 파일을 다시 올리세요.',410);return {...b,orgName:db.prepare('SELECT name FROM organizations WHERE id=?').get(user.org_id)?.name,workbook:JSON.parse(b.workbook)};}
export function previewImport(batch,input){
 must(batch.workbook.conversion?.state!=='WAITING','OZD 변환을 완료한 뒤 미리보기와 등록을 진행하세요.',409);
 const config=configSchema.parse(input);const sheet=batch.workbook.sheets.find(s=>s.name===config.sheet);must(sheet,'시트를 확인하세요.');
 const keys=new Set(IMPORT_FIELDS.map(x=>x[0]));must(Object.keys(config.mapping).every(k=>keys.has(k)),'지원하지 않는 매핑 항목입니다.');
 must(config.mapping.originalName!==undefined&&config.mapping.quantity!==undefined,'품명과 수량 열을 연결하세요.');
 must(new Set(Object.values(config.mapping)).size===Object.values(config.mapping).length,'하나의 열을 여러 필드에 중복 연결할 수 없습니다.');
 must(Object.values(config.mapping).every(c=>c<sheet.columns),'매핑 열 범위를 확인하세요.');
 const rows=[],errors=[],warnings=[...(batch.workbook.warnings||[])];let skipped=0;
 for(let index=config.headerRow;index<sheet.rows.length;index++){
  const cells=sheet.rows[index];if(cells.every(c=>!c.text.trim()))continue;
  const cell=k=>cells[config.mapping[k]]||{text:'',value:null};
  const text=k=>cell(k).text.trim();
  if(/^(합계|총계|소계|총합계)$/.test(text('originalName').replace(/\s/g,''))){skipped++;continue;}
  if(!text('originalName')&&!text('quantity')){skipped++;continue;}
  const rowNumber=index+1;
  const values={};for(const [key]of IMPORT_FIELDS)values[key]=text(key);
  values.quantity=typeof cell('quantity').value==='number'?cell('quantity').value:Number(text('quantity').replaceAll(',',''));
  for(const key of ['acquiredDate','decisionDate'])if(cell(key).date)values[key]=cell(key).date;else if(/^\d{4}[./-]\d{1,2}[./-]\d{1,2}\.?$/.test(values[key])){const p=values[key].split(/[./-]/);values[key]=`${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;}
  for(const key of ['acquiredDate','decisionDate'])if(!cell(key).date&&typeof cell(key).value==='number'&&cell(key).value>=20000&&cell(key).value<=100000){const date=XLSX.SSF.parse_date_code(cell(key).value);if(date)values[key]=`${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;}
  const issues=[];
  if(values.acquiredUnitPrice.length>50||values.manufacturer.length>200||values.model.length>200)issues.push('단가·제조사·모델 값 길이를 확인하세요.');
  if(typeof cell('listingNo').value==='number')issues.push('16자리 물품목록번호는 숫자 저장 시 정밀도가 손실될 수 있습니다. 원본 번호를 확인해 텍스트 셀로 저장하세요.');
  if(values.classificationName.length>200)issues.push('물품분류명은 200자 이하로 입력하세요.');
  for(const key of ['acquiredDate','decisionDate'])if(/^\d{8}$/.test(values[key]))values[key]=values[key].slice(0,4)+'-'+values[key].slice(4,6)+'-'+values[key].slice(6);
  if(!values.department)values.department=config.department;
  if(values.department.length>100||values.institutionName.length>200)issues.push('기관·부서명의 길이를 확인하세요.');
  const orgNorm=v=>String(v||'').normalize('NFKC').replace(/\s/g,'');
  if(values.institutionName&&batch.orgName&&orgNorm(values.institutionName)!==orgNorm(batch.orgName))issues.push('엑셀 기관명이 로그인 기관과 다릅니다. 원본·소속을 확인하세요. 기관을 자동 변경하지 않습니다.');
  if(values.listingNo){try{
   const n=splitListingNumber(values.listingNo);
   if(values.classificationCode&&values.classificationCode.slice(0,8)!==n.classificationCode)issues.push('물품목록번호와 별도 분류번호가 다릅니다.');
   if(values.identificationCode&&values.identificationCode!==n.identificationCode)issues.push('물품목록번호와 별도 식별번호가 다릅니다.');
   values.listingNo=n.listingNo;values.classificationCode ||= n.classificationCode;values.identificationCode ||= n.identificationCode;
  }catch(e){issues.push(e.message);}}
  values.sourceName=values.originalName;
  const nameHeader=sheet.rows[config.headerRow-1]?.[config.mapping.originalName]?.text?.replace(/\s/g,'').toLowerCase();
  if(['g2b목록명','품명/규격','품명및규격'].includes(nameHeader)&&values.originalName.includes(',')){
   const parsed=parseCatalogName(values.originalName);values.specification ||= parsed.specification;values.manufacturer ||= parsed.manufacturer;values.model ||= parsed.model;values.originalName=parsed.title;
  }
  for(const [key,col]of Object.entries(config.mapping))if(cells[col]?.formula)issues.push(`${IMPORT_FIELDS.find(f=>f[0]===key)?.[1]}에 수식이 있습니다. 값으로 붙여넣은 파일을 사용하세요.`);
  if(values.originalName.length<2||values.originalName.length>200||values.sourceName.length>200)issues.push('품명을 2~200자로 확인하세요.');
  if(!Number.isInteger(values.quantity)||values.quantity<1||values.quantity>100000)issues.push('수량은 1~100,000 사이 정수여야 합니다.');
  if(values.classificationCode&&!/^\d{8}(\d{2})?$/.test(values.classificationCode))issues.push('분류번호는 8/10자리 숫자입니다.');
  if(values.identificationCode&&!/^\d{8}$/.test(values.identificationCode))issues.push('물품식별번호는 8자리 숫자입니다. 자산번호와 구별하세요.');
  if(values.externalId.length>100)issues.push('기관 자산번호가 너무 깁니다.');
  if(values.specification.length>200||values.decisionRef.length>200||values.acquiredPrice.length>50)issues.push('규격/문서번호/금액의 길이를 확인하세요.');
  if(issues.length){errors.push({row:rowNumber,messages:issues});continue;}
  rows.push({...values,rowNumber,raw:cells});
 }
 if(!rows.length&&!errors.length)errors.push({row:config.headerRow,messages:['선택한 머리글 아래에 데이터가 없습니다.']});
 if(rows.length>2000)errors.push({row:0,messages:['최대 2,000개 데이터 행을 가져올 수 있습니다.']});
 const ids=new Set();for(const row of rows)if(row.externalId){if(ids.has(row.externalId))errors.push({row:row.rowNumber,messages:[`중복 기관 자산번호: ${row.externalId}`]});ids.add(row.externalId);}
 if(rows.some(r=>!r.externalId))warnings.push('기관 자산번호가 없는 행은 초안만 만듭니다. 실물 인계 전에 공식 자산행을 별도로 연결하세요.');
 if(rows.some(r=>!r.decisionRef))warnings.push('불용결정번호가 없는 물품은 비공개 초안이며 결정 증빙 확인 전 게시되지 않습니다.');
 if(rows.some(r=>/폐품|폐기/.test(r.condition)))warnings.push('원본에 폐품·폐기 상태가 있습니다. 이 값은 보존하며 재사용 적합성은 현물 검수와 별도 증빙 검토로 확인해야 합니다.');
 warnings.push('파일 수량은 시작값입니다. 상태·실사·불용결정은 자동 승인하지 않습니다.');
 const groups=new Map();for(const r of rows){const key=config.groupIdentical&&r.decisionRef?JSON.stringify([r.originalName,r.identificationCode,r.classificationCode,r.specification,r.decisionRef,r.decisionDate,r.account,r.department]):String(r.rowNumber);const a=groups.get(key)||[];a.push(r);groups.set(key,a);}
 for(const g of groups.values())if(g.reduce((n,r)=>n+r.quantity,0)>100000)errors.push({row:g[0].rowNumber,messages:['묶음 합계는 100,000개 이내로 나누세요.']});
 return {config,rows,groups:[...groups.values()],errors,warnings,skipped,lotCount:groups.size,totalQuantity:rows.reduce((n,r)=>n+r.quantity,0)};
}
export function confirmImport(db,user,batchId,input){business(user);const batch=loadImport(db,user,batchId),plan=previewImport(batch,input);must(!plan.errors.length,'오류 행을 수정한 뒤 다시 가져오세요.');
 const requestHash=hash(JSON.stringify([batch.file_hash,plan.config]));
 return transaction(db,()=>{
  const prior=db.prepare('SELECT result FROM import_receipts WHERE org_id=? AND request_hash=?').get(user.org_id,requestHash);if(prior)return {...JSON.parse(prior.result),reused:true};
  for(const row of plan.rows)must(!db.prepare('SELECT 1 FROM imported_rows WHERE org_id=? AND file_hash=? AND sheet=? AND row_number=?').get(user.org_id,batch.file_hash,plan.config.sheet,row.rowNumber),`${row.rowNumber}행은 이미 등록했습니다. 기존 초안을 확인하세요.`,409);
  const lotIds=[];
  for(const group of plan.groups){
   const first=group[0],quantity=group.reduce((n,r)=>n+r.quantity,0);
   const d={department:first.department,specification:first.specification,classificationName:first.classificationName,listingNo:first.listingNo,title:first.originalName.slice(0,100),category:'OTHER',manufacturer:first.manufacturer||'',model:first.model||'',description:first.specification?`엑셀 기재 규격: ${first.specification}`:'',actualCount:quantity,ledgerCount:quantity,decisionQty:quantity,decisionRef:first.decisionRef,decisionDate:first.decisionDate,sourceTargetReference:`${batch.name} / ${plan.config.sheet} / ${group.map(r=>r.rowNumber).join(', ')}행 (승인 대상 대조 필요)`.slice(0,1000),originalName:first.sourceName,classificationCode:first.classificationCode,identificationCode:first.identificationCode,mismatchNote:'',pickup:'수령기관 운반 · 상차 및 일정 별도 협의',needsWipe:false,specialReview:false,privacyChecked:false,groups:[{condition:'UNKNOWN',quantity,inspection:'NONE',note:'엑셀 등록 · 현물 상태/수량 확인 필요'}]};
   const id=saveLot(db,user,d);lotIds.push(id);
   db.prepare('UPDATE lots SET source_snapshot=? WHERE id=?').run(JSON.stringify({...JSON.parse(db.prepare('SELECT source_snapshot FROM lots WHERE id=?').get(id).source_snapshot),source:batch.workbook.inputFormat==='OZD'?'OZD_DOCUMENT_IMPORT':'EDUFINE_EXCEL_IMPORT',inputFormat:batch.workbook.inputFormat||'EXCEL',conversion:batch.workbook.conversion||null,originalRows:group.map(r=>({rowNumber:r.rowNumber,originalName:r.sourceName,quantity:r.quantity,acquiredDate:r.acquiredDate,acquiredUnitPrice:r.acquiredUnitPrice,acquiredAmount:r.acquiredPrice,condition:r.condition})),fileHash:batch.file_hash,fileName:batch.name,sheet:plan.config.sheet,listingNo:first.listingNo,department:first.department,specification:first.specification,classificationName:first.classificationName,institutionName:first.institutionName,rowNumbers:group.map(r=>r.rowNumber)}),id);
   const assetRows=group.filter(r=>r.externalId).map(r=>assetSchema.parse({...r,originalName:r.sourceName}));
   if(assetRows.length){importAssets(db,user,assetRows,batch.name);const ids=assetRows.map(r=>db.prepare('SELECT id FROM assets WHERE org_id=? AND external_id=?').get(user.org_id,r.externalId).id);bindAssets(db,user,id,ids);}
   for(const r of group)db.prepare('INSERT INTO imported_rows VALUES(?,?,?,?,?)').run(user.org_id,batch.file_hash,plan.config.sheet,r.rowNumber,id);
  }
  const result={lotIds,rows:plan.rows.length,totalQuantity:plan.totalQuantity,lotCount:lotIds.length,reused:false};db.prepare('INSERT INTO import_receipts VALUES(?,?,?,?,?)').run(uid(),user.org_id,requestHash,JSON.stringify(result),now());audit(db,user,'EXCEL_DRAFTS_CREATED',batchId,{...result,fileHash:batch.file_hash});return result;
 });
}
