#!/usr/bin/env python3
"""Offline corpus builder. Python 3.10+ stdlib; never upload or overwrite output.
Usage: --md-zip source.zip --out NEW_DIRECTORY [--original-zip originals.zip]
"""
from __future__ import annotations
import argparse,hashlib,html,json,re,sqlite3,unicodedata,zipfile
from pathlib import Path
from datetime import datetime,timezone
SCHEMA="""CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,currentness TEXT NOT NULL,date_note TEXT NOT NULL,original_name TEXT NOT NULL,original_path TEXT NOT NULL,sha256 TEXT NOT NULL,metadata TEXT NOT NULL);
CREATE TABLE chunks(id TEXT PRIMARY KEY,doc_id TEXT NOT NULL,locator TEXT NOT NULL,line_start INTEGER NOT NULL,line_end INTEGER NOT NULL,text TEXT NOT NULL,quality TEXT NOT NULL);
CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED,title,body,grams,tokenize='unicode61');
CREATE INDEX chunks_doc ON chunks(doc_id); PRAGMA user_version=1;"""
def grams(text):
    result=set()
    for word in re.findall('[가-힣a-z0-9]+',unicodedata.normalize('NFKC',text).lower()):
        result.update(word[i:i+2] for i in range(len(word)-1))
    return ' '.join(sorted(result))
def cleaned(line):
    if re.match(r'^\s*(```|<a |<details|</details|<summary|</summary|\[전체본|\[그림:|!\[)',line):return ''
    if '자동 판독 결과입니다.' in line or '전체본 경로:' in line:return ''
    line=re.sub(r'</?(?:p|tr)[^>]*>','\n',line)
    line=re.sub(r'</t[dh]>',' | ',line)
    line=re.sub(r'<[^>]+>','',line)
    line=re.sub(r'\[([^\]]+)\]\([^)]+\)',r'\1',line)
    return re.sub('[ \t]+',' ',html.unescape(line)).strip()
def chunks(md,is_source):
    lines=md.splitlines();start=0
    if is_source:
        for i,line in enumerate(lines):
            if re.match(r'^## (원문 전체|원문 구역|시트|슬라이드|본문)',line):start=i;break
    section,quality,buf,length='본문','CONVERTED',[],0
    def emit():
        text='\n'.join(t for _,t in buf).strip()
        if len(text)>=35 and len(re.findall('[가-힣a-zA-Z]',text))/max(1,len(text))>.12:
            return section,buf[0][0],buf[-1][0],text,quality
        return None
    for i in range(start,len(lines)):
        raw=lines[i];major=re.match(r'^#{2,4}\s+(.+)',raw)
        if major:
            h=major.group(1).strip()
            if buf:
                item=emit()
                if item:yield item
                buf=[];length=0
            if 'OCR' in h:quality='OCR'
            elif '내장 텍스트' in h:quality='TEXT_LAYER'
            else:section=h;quality='CONVERTED'
            continue
        text=cleaned(raw)
        if not text:continue
        for off in range(0,len(text),1600):
            piece=text[off:off+1600]
            if length+len(piece)>1800 and buf:
                item=emit()
                if item:yield item
                tail=buf[-2:]
                if sum(len(t) for _,t in tail)>240:tail=[]
                buf=tail;length=sum(len(t) for _,t in buf)
            buf.append((i+1,piece));length+=len(piece)+1
    if buf:
        item=emit()
        if item:yield item

def prepare(md_zip,out,original_zip=None):
    if out.exists():raise ValueError('출력 경로가 이미 있습니다. 기존 DB를 보존하고 새 버전 폴더를 지정하세요.')
    out.mkdir(parents=True,mode=0o700);(out/'md').mkdir(mode=0o700);(out/'originals').mkdir(mode=0o700)
    report={'builtAt':datetime.now(timezone.utc).isoformat(),'documents':0,'chunks':0,'originalFiles':0,'duplicates':[],'excluded':[],'warnings':['제공판 원문 변환 자료입니다. 법령의 현행성·적용기관을 전수 검증하지 않았습니다.','OCR·표 구조를 법적 결론으로 확정하기 전 원문 대조가 필요합니다.','자료 반입·기관 간 공유·외부 모델 전송은 각각 승인 확인이 필요합니다.'],'sourceZipSha256':hashlib.sha256(md_zip.read_bytes()).hexdigest()}
    db=sqlite3.connect(out/'index.sqlite');db.executescript(SCHEMA)
    with zipfile.ZipFile(md_zip) as z:
        matches=[n for n in z.namelist() if n.endswith('/03_quality/source_manifest.json')]
        if len(matches)!=1:raise ValueError('MD 자료집의 source_manifest.json 하나가 필요합니다.')
        if sum(info.file_size for info in z.infolist())>128*1024*1024:raise ValueError('MD 자료집 압축 해제 크기가 128MB를 넘습니다.')
        root=matches[0].split('03_quality/')[0];manifest=json.loads(z.read(matches[0]))
        if not isinstance(manifest,list) or len(manifest)>5000:raise ValueError('자료 목록 형식/크기를 확인하세요.')
        source_archive=zipfile.ZipFile(original_zip) if original_zip else None
        original_map={unicodedata.normalize('NFC',n):n for n in source_archive.namelist()} if source_archive else {}
        def add(doc,md):
            did=doc['id']
            if not re.fullmatch(r'(D[0-9]{3}|DESIGN-[0-9]{2})',did):raise ValueError('잘못된 문서 ID')
            seen=set();saved=[]
            for loc,lo,hi,text,quality in chunks(md,doc['kind']!='DESIGN'):
                signature=hashlib.sha256(text.encode()).hexdigest()
                if signature in seen:continue
                seen.add(signature);cid=did+'-'+hashlib.sha256(f'{loc}:{lo}:{signature}'.encode()).hexdigest()[:16]
                saved.append((cid,did,loc,lo,hi,text,quality))
            db.execute('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)',(did,doc['title'],doc['kind'],'UNVERIFIED_PROVIDED_EDITION',doc['dateNote'],doc['originalName'],doc['originalPath'],doc['sha256'],json.dumps(doc['metadata'],ensure_ascii=False)))
            for row in saved:
                db.execute('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)',row)
                db.execute('INSERT INTO search(id,title,body,grams) VALUES(?,?,?,?)',(row[0],doc['title'],row[5],grams(doc['title']+' '+row[5])))
            (out/'md'/f'{did}.md').write_text(md,encoding='utf-8');report['documents']+=1;report['chunks']+=len(saved)
        for item in manifest:
            did=item['document_id'];canonical=item.get('duplicate_canonical_id',did)
            if canonical!=did:report['duplicates'].append({'id':did,'canonical':canonical});continue
            if did in ('D001','D121'):
                report['excluded'].append({'id':did,'reason':'팀 아이디어 또는 법령명 목록: 지침 본문 아님'});continue
            relative=item['markdown']
            if '..' in Path(relative).parts or Path(relative).is_absolute():raise ValueError('잘못된 원문 경로')
            md=z.read(root+relative).decode('utf-8');name=item['original_filename'];kind='TEMPLATE' if re.search('서식|합의서|인계인수서',name) else 'REFERENCE'
            original='';key=unicodedata.normalize('NFC',item['original_archive_path'])
            if source_archive and kind=='TEMPLATE' and key in original_map:
                info=source_archive.getinfo(original_map[key])
                if info.file_size<=2*1024*1024:
                    data=source_archive.read(info)
                    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError(f'{did}: 원본 해시가 다릅니다.')
                    if not re.fullmatch(r'D[0-9]{3}',did):raise ValueError('잘못된 문서 ID')
                    original=did+Path(name).suffix.lower();(out/'originals'/original).write_bytes(data);report['originalFiles']+=1
            add({'id':did,'title':name,'kind':kind,'dateNote':item['date_note'],'originalName':name,'originalPath':original,'sha256':item['sha256'],'metadata':{'category':item['category'],'archivePath':item['original_archive_path'],'effectiveFrom':None,'effectiveTo':None,'currentnessVerified':False,'originalIsBlankFormVerified':False}},md)
        if source_archive:source_archive.close()
        for name in sorted(z.namelist()):
            if '/02_development/' not in name or not name.endswith('.md') or '/07_' in name:continue
            md=z.read(name).decode();did='DESIGN-'+Path(name).stem[:2]
            add({'id':did,'title':md.splitlines()[0].lstrip('# '),'kind':'DESIGN','dateNote':'2026-10-31 정리; 법령 원문 아님','originalName':'','originalPath':'','sha256':hashlib.sha256(md.encode()).hexdigest(),'metadata':{'notAuthority':True}},md)
    db.commit();db.execute("INSERT INTO search(search) VALUES('optimize')");db.commit()
    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('검색 DB 무결성 검사 실패')
    db.close();report['indexSha256']=hashlib.sha256((out/'index.sqlite').read_bytes()).hexdigest()
    (out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'README_PRIVATE.md').write_text('# 비공개 RAG 자료\n\n공개 GitHub·Docker 이미지에 넣지 마세요. index.sqlite와 md·originals·manifest.json을 하나의 버전으로 보관합니다. 검색은 코드의 RAG_CORPUS_DIR로 연결합니다. 모든 지침은 제공판/현행성 미검증입니다. 원문 후보는 빈 양식/작성예시 여부를 확인한 후 사용합니다.\n',encoding='utf-8')
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--md-zip',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--original-zip',type=Path)
    a=p.parse_args();print(json.dumps(prepare(a.md_zip,a.out,a.original_zip),ensure_ascii=False,indent=2))
