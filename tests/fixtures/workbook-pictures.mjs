// Synthetic OOXML fixture. Contains no uploaded institutional data.
import * as XLSX from 'xlsx';
import {unzipSync,zipSync,strToU8} from 'fflate';
import sharp from 'sharp';
export async function pictureWorkbook({external=false,hidden=false,span=false,org='',department='도서실'}={}){
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
  ['합성 테스트 관리전환'],[],['물품목록번호','자산번호','G2B목록명','수량','부서','불용결정번호','기관명'],
  ['56101504-00001234','SYN-0001','회의의자, 합성 제조사, 모델 SYN-7',20,department,'합성-100',org],
  ['56101504-00001234','SYN-0002','회의의자, 합성 제조사, 모델 SYN-7',10,'행정실','합성-100',org]
 ]),'전환목록');
 if(hidden){XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['품명','수량'],['숨김',1]]),'표시용');wb.Workbook={Sheets:[{Hidden:1},{Hidden:0}]};}
 const zip=unzipSync(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
 const sheet='xl/worksheets/sheet1.xml';zip[sheet]=strToU8(Buffer.from(zip[sheet]).toString().replace('</worksheet>','<drawing r:id="drawing1"/></worksheet>'));
 zip['xl/worksheets/_rels/sheet1.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="drawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
 zip['xl/drawings/drawing1.xml']=strToU8(`<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:row>3</xdr:row></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:row>${span?4:3}</xdr:row></xdr:to><xdr:pic><xdr:blipFill><a:blip r:embed="picture1"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
 zip['xl/drawings/_rels/drawing1.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="picture1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${external?'https://example.invalid/tracker.png':'../media/picture1.png'}" ${external?'TargetMode="External"':''}/></Relationships>`);
 zip['xl/media/picture1.png']=await sharp({create:{width:70,height:50,channels:3,background:'#a3bbc1'}}).png().toBuffer();return Buffer.from(zipSync(zip));
}
