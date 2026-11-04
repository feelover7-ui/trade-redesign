/** Genuine-format SYNTHETIC fixtures; no public/user OZD or vendor SDK is included. */
import {gzipSync} from 'node:zlib';
const i32=v=>{const b=Buffer.alloc(4);b.writeInt32BE(v);return b;};
const u16=v=>{const b=Buffer.alloc(2);b.writeUInt16BE(v);return b;};
const utf=s=>{const b=Buffer.from(s);return Buffer.concat([u16(b.length),b]);};
export const demandFields=[['ORG_CD',12],['REQRE_INQIRE_SN',2],['REQRE_INQIRE_DETAIL_SN',2],['THNG_CL_CD',12],['THNG_IDNTFC_CD',12],['THNG_NM',12],['ACQS_DTE',12],['ACQS_UNTPC',2],['THNG_STS_CD',12],['THNG_STS_NM',12],['REQRE_INQIRE_QTY',2],['REQRE_INQIRE_REQST_QTY',2]];
export function syntheticRows(){return [
 {ORG_CD:'SYNTHETIC',REQRE_INQIRE_SN:'9',REQRE_INQIRE_DETAIL_SN:'1',THNG_CL_CD:'56101703',THNG_IDNTFC_CD:'00001234',THNG_NM:'책상, 합성제조사, TEST-100, 1600×600×720mm',ACQS_DTE:'20181012',ACQS_UNTPC:'141000',THNG_STS_CD:'04',THNG_STS_NM:'폐품',REQRE_INQIRE_QTY:'31',REQRE_INQIRE_REQST_QTY:'0'},
 {ORG_CD:'SYNTHETIC',REQRE_INQIRE_SN:'9',REQRE_INQIRE_DETAIL_SN:'2',THNG_CL_CD:'56101703',THNG_IDNTFC_CD:'00001234',THNG_NM:'책상, 합성제조사, TEST-100, 1600×600×720mm',ACQS_DTE:'20181013',ACQS_UNTPC:'150000',THNG_STS_CD:'04',THNG_STS_NM:'폐품',REQRE_INQIRE_QTY:'2',REQRE_INQIRE_REQST_QTY:'0'}
];}
export function makeModule({rows=syntheticRows(),fields=demandFields,version=2040,extraTable=false}={}){
 const datasets=[{name:'OZParam',fields:[['orgCd',12]],rows:[{orgCd:'SYNTHETIC'}]},{name:'EABOPDSMGCN005R01',fields,rows}];
 if(extraTable)datasets.push({...datasets[1],name:'OTHER_DEMAND'});
 let offset=0;const pool=[],indices=[];
 for(const ds of datasets){ds.index=[];for(const row of ds.rows){
  const bytes=Buffer.concat(ds.fields.map(([key,type])=>type===12?(row[key]===null?Buffer.from([1]):Buffer.concat([Buffer.from([0]),utf(String(row[key]??''))])):utf(String(row[key]??''))));
  ds.index.push([bytes.length,offset]);pool.push(bytes);offset+=bytes.length;
 }}
 const descriptor=Buffer.from('TEST_CACHE','utf16le');for(let p=0;p<descriptor.length;p+=2){const t=descriptor[p];descriptor[p]=descriptor[p+1];descriptor[p+1]=t;}
 const metadata=[i32(descriptor.length/2),descriptor,Buffer.from([1]),utf('OZBINDEDDATAMODULE'),i32(version),utf(''),i32(0),i32(datasets.length)];
 for(const ds of datasets){metadata.push(utf(ds.name),utf('ByteArraySet'),utf(''),i32(ds.fields.length));for(const [key,type] of ds.fields)metadata.push(i32(1),i32(type),utf(key),Buffer.from([1]));metadata.push(i32(0),i32(1),i32(offset),i32(ds.rows.length),utf(''));for(const pair of ds.index)indices.push(i32(pair[0]),i32(pair[1]));}
 return Buffer.concat([...metadata,i32(offset),...indices,...pool]);
}
// Test writer uses its own PC1 arithmetic state. Never imported by production modules.
function encoder(){const key=Buffer.alloc(16);key.write('FORCS_OZPROJECT');let carry=0,previous=0;return {reset(){carry=previous=0;},encode(bytes){const out=Buffer.alloc(bytes.length);for(let p=0;p<bytes.length;p++){
 let word=0,sum=0;for(let i=0;i<8;i++){word^=key.readUInt16BE(i*2);const hi=((carry+i)*20021)&65535;const cross=(word*346)&65535;carry=(hi+cross+previous)&65535;previous=cross;word=((word*20021)&65535)+1;sum^=word^carry;}
 const value=bytes[p];out[p]=(value^(sum>>>8)^(sum&255))&255;for(let i=0;i<16;i++)key[i]^=value;
 }return out;}};}
export function makeOzd({rows=syntheticRows(),fields=demandFields,version=[3,0,0,1],password='NoPassword_Entered',plain=false,corruptGzip=false,duplicateEntry=false,invalidDirectory=false,extraTable=false,moduleVersion=2040,rawModule}={}){
 const module=rawModule||makeModule({rows,fields,extraTable,version:moduleVersion});const zipped=gzipSync(module);if(corruptGzip)zipped[zipped.length-5]^=128;
 const entries=[{name:'e/eab/opds/mgcn/test.o~j',bytes:zipped},{name:'test.ozr',bytes:gzipSync(Buffer.from('<OZREPORT SCRIPTCODE="globalThis.ozd_script_ran=true"/>'))}];if(duplicateEntry)entries.push(entries[0]);
 const start=8+entries.length*532,header=Buffer.alloc(start);header.writeUInt32LE(start,0);header.writeUInt32LE(entries.length,4);let offset=0;
 entries.forEach((e,i)=>{const p=8+i*532,name=Buffer.from(e.name,'utf16le');header.writeUInt32LE(name.length,p);name.copy(header,p+4);header.writeUInt32LE(invalidDirectory?0:offset,p+524);header.writeUInt32LE(e.bytes.length,p+528);offset+=e.bytes.length;});
 const body=Buffer.concat([header,...entries.map(e=>e.bytes)]),pc=encoder();const magic=pc.encode(Buffer.from(plain?'dkanehahffz':'dkanehahffk'));pc.reset();const envelope=plain?body:pc.encode(body);
 const label=Buffer.from(password),prefix=Buffer.alloc(10);prefix.write('OZP');Buffer.from(version).copy(prefix,3);prefix.writeUInt16LE(label.length,7);
 return Buffer.concat([prefix,label,magic,envelope]);
}
