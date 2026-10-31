import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';

async function login(page:Page,email:string){
  await page.goto('/');await page.getByLabel('이메일',{exact:true}).fill(email);
  await page.getByLabel('비밀번호',{exact:true}).fill('DemoTrade!2026');
  await page.getByRole('button',{name:'기관 계정으로 로그인'}).click();
  await expect(page.getByRole('heading',{name:'우리 학교에 필요한 물품을 찾아보세요'})).toBeVisible();
}
async function toast(page:Page,text:string){await expect(page.locator('.toast')).toContainText(text);}
async function download(page:Page,name:string){
  const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
  const file=await pending;expect(await file.failure()).toBeNull();return {name:file.suggestedFilename(),bytes:await readFile((await file.path())!)};
}

test('등록부터 독립 검토·양 기관 증빙·불일치 보류·대장 완료까지 실제 UI',async({page,browser,baseURL})=>{
  test.setTimeout(120000);
  const pages=[page];const errors:string[]=[];
  const photo=await sharp({create:{width:100,height:80,channels:3,background:'#cae4dd'}}).png().toBuffer();
  const attachment={name:'한글_합성증빙.png',mimeType:'image/png',buffer:photo};
  async function actor(email:string){const p=await browser.newPage({baseURL});pages.push(p);p.on('pageerror',e=>errors.push(e.message));await login(p,email);return p;}
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await login(page,'staff1@demo.local');await page.goto('/#/new');
    for(const [label,value] of [['물품 이름 *','검수용 합성 의자 세 개'],['실물 확인 수량 *','3'],['상태 1 수량','3'],['대장 수량 *','3'],['불용결정 대상 수량 *','3'],['대장에 등록된 품명','합성 대장 의자'],['불용결정 문서번호','합성검수-2026-001'],['불용결정일','2026-01-01'],['대상목록·자산범위 근거','합성 대상목록 1번']])await page.getByLabel(label,{exact:true}).fill(value);
    await page.getByLabel('첨부할 사진의 얼굴·이름표·학교 보안정보를 확인하고 제거했습니다.').check();
    await page.getByRole('button',{name:'비공개 초안 저장',exact:true}).click();await toast(page,'초안을 저장');
    await expect(page).toHaveURL(/\/edit$/);const lotPath=new URL(page.url()).hash.replace(/\/edit$/,'');
    await page.locator('.upload-control input').nth(0).setInputFiles({name:'한글_현물사진.png',mimeType:'image/png',buffer:photo});await toast(page,'첨부파일을 저장');
    await page.locator('.upload-control input').nth(1).setInputFiles(attachment);await expect(page.getByRole('link',{name:'한글_합성증빙.png'})).toBeVisible();
    await page.getByRole('link',{name:'상세·게시 검토 화면'}).click();
    await page.getByRole('button',{name:'게시 검토 요청',exact:true}).click();await expect(page.locator('.badge')).toHaveText('게시 검토 대기');
    // Author cannot approve their own listing.
    await expect(page.getByRole('button',{name:'증빙 검토 후 게시'})).toHaveCount(0);
    const reviewer=await actor('review1@demo.local');await reviewer.goto('/'+lotPath);
    const evidence=await reviewer.getByRole('link',{name:attachment.name,exact:true}).getAttribute('href');
    const response=await reviewer.request.get(evidence!);expect(response.ok()).toBeTruthy();expect(response.headers()['content-disposition']).toContain(encodeURIComponent(attachment.name));expect(response.headers()['content-type']).toContain('image/webp');
    await expect(reviewer.locator('.check-grid input')).toHaveCount(6);
    for(const box of await reviewer.locator('.check-grid input').all())await box.check();
    await reviewer.getByLabel('검토 근거·메모').fill('합성 원문·대상목록·현물사진을 독립 검토했습니다.');
    await reviewer.getByRole('button',{name:'증빙 검토 후 게시',exact:true}).click();await expect(reviewer.locator('.badge')).toHaveText('나눔 중');
    // Real downloadable ZIP before allocation, then blocked after reservation.
    await page.goto('/#/onbid');
    await page.getByLabel('매각 준비할 묶음').selectOption(lotPath.split('/').pop()!);
    const zip=await download(page,'준비자료 ZIP 내려받기');
    const entries=unzipSync(zip.bytes);expect(entries['item.csv']).toBeTruthy();expect(strFromU8(entries['item.json'])).toContain('검수용 합성 의자');
    const receiver=await actor('staff2@demo.local');await receiver.goto('/'+lotPath);
    await receiver.getByLabel('필요 수량',{exact:true}).fill('3');await receiver.getByLabel('사용 목적',{exact:true}).fill('합성 검수 교실에 재사용');
    await receiver.getByLabel('인수 희망일').fill(new Date(Date.now()+86400000*7).toISOString().slice(0,10));
    await receiver.getByRole('button',{name:'받기 신청',exact:true}).click();await expect(receiver.locator('.badge')).toHaveText('신청 접수');
    const casePath=new URL(receiver.url()).hash;
    await page.goto('/'+casePath);await page.getByRole('button',{name:'수량 예비 배정',exact:true}).click();await expect(page.locator('.badge')).toHaveText('예비 배정');
    await page.goto('/#/onbid');await page.getByLabel('매각 준비할 묶음').selectOption(lotPath.split('/').pop()!);await page.getByRole('button',{name:'준비자료 ZIP 내려받기',exact:true}).click();await toast(page,'자동 매각자료 생성이 차단');await page.goto('/'+casePath);
    // Missing evidence is rejected, with a visible failure message.
    await page.getByLabel(/공식 양 기관 승인과 자산 연결을 확인했고/).check();
    await page.getByRole('button',{name:'인계 3개 확인',exact:true}).click();await toast(page,'증빙을 먼저 확인');await expect(page.locator('.badge')).toHaveText('예비 배정');
    const buyerReviewer=await actor('review2@demo.local');
    for(const [p,steps] of [[reviewer,['inquiry','agreement_sender','approval_sender']],[buyerReviewer,['agreement_receiver','approval_receiver']]] as [Page,string[]][]){
      await p.goto('/'+casePath);await p.locator('.upload-control input').setInputFiles(attachment);await toast(p,'첨부파일을 저장');
      await p.getByLabel('우리 기관이 첨부한 증빙').selectOption({label:attachment.name});
      for(const step of steps){await p.getByLabel('확인할 단계').selectOption(step);await p.getByLabel('공식 처리번호·확인 근거').fill('합성근거-'+step);await p.getByRole('button',{name:'확인 근거 저장',exact:true}).click();await toast(p,'수동 확인 근거를 기록');}
    }
    // Actual CSV file import, preserving leading zeroes, then asset binding.
    await page.goto('/#/inventory');await expect(page.getByRole('heading',{name:'대장 가져오기·자산 연결',exact:true})).toBeVisible();
    const csv='\uFEFF자산번호,대장품명,수량,물품분류번호,물품식별번호\r\n00001234,합성 대장 의자,3,00123456,00005678\r\n';
    await page.locator('input[type=file]').setInputFiles({name:'한글_검수대장.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
    await expect(page.getByText('한글_검수대장.csv · 1행')).toBeVisible();
    await page.getByRole('button',{name:'검증 후 원본 저장',exact:true}).click();await toast(page,'신규 1행');
    await page.getByLabel('00001234 선택').check();await page.getByLabel('연결할 묶음').selectOption(lotPath.split('/').pop()!);
    await page.getByRole('button',{name:'1개 자산행 연결',exact:true}).click();await toast(page,'묶음에 연결');
    const exported=await download(page,'원본 내보내기');expect(exported.name).toBe('원본자산_참고자료.csv');expect(exported.bytes.subarray(0,3).toString('hex')).toBe('efbbbf');
    expect(exported.bytes.toString('utf8')).toContain('"00001234","합성 대장 의자","3","00123456","00005678"');
    await page.goto('/'+casePath);await page.getByLabel('00001234 배분 수량').fill('3');
    await page.getByRole('button',{name:'총 3개 자산 배분 저장',exact:true}).click();await toast(page,'자산·수량을 연결');
    await page.getByLabel(/공식 양 기관 승인과 자산 연결을 확인했고/).check();await page.getByRole('button',{name:'인계 3개 확인',exact:true}).click();await expect(page.locator('.badge')).toHaveText('인계 완료');
    await receiver.reload();await receiver.getByLabel('실제로 받은 수량').fill('2');await receiver.getByLabel('상태·수량 확인 메모').fill('합성 검수: 한 개는 이동 중');
    await receiver.getByRole('button',{name:'인수 사실 기록',exact:true}).click();await expect(receiver.locator('.badge')).toHaveText('수량 불일치');await expect(receiver.getByRole('alert')).toContainText('배정 수량 전체가 보류');
    await receiver.getByLabel('실제로 받은 수량').fill('3');await receiver.getByRole('button',{name:'인수 사실 기록',exact:true}).click();await expect(receiver.locator('.badge')).toHaveText('인수 확인');
    for(const [p,step] of [[reviewer,'ledger_sender'],[buyerReviewer,'ledger_receiver']] as [Page,string][]){
      await p.reload();await p.getByLabel('우리 기관이 첨부한 증빙').selectOption({label:attachment.name});await p.getByLabel('확인할 단계').selectOption(step);await p.getByLabel('공식 처리번호·확인 근거').fill('합성근거-'+step);
      await p.getByRole('button',{name:'확인 근거 저장',exact:true}).click();await toast(p,'수동 확인 근거를 기록');
    }
    await reviewer.reload();await reviewer.getByRole('button',{name:'모든 증빙 확인 완료',exact:true}).click();await expect(reviewer.locator('.badge')).toHaveText('증빙 확인 완료');
    await expect(reviewer.getByText('공식 API로 확인된 행정완료는 아닙니다.')).toBeVisible();
    await reviewer.screenshot({path:'test-results/desktop-complete.png',fullPage:true});
    await reviewer.setViewportSize({width:390,height:844});await reviewer.screenshot({path:'test-results/mobile-complete.png',fullPage:true});
    expect(await reviewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    const draft=await download(reviewer,'업무 초안 내려받기');expect(draft.bytes.toString()).toContain('인수 수량: 3');expect(draft.bytes.toString()).toContain('00001234');
    expect(errors).toEqual([]);
  }finally{for(const p of pages.slice(1))await p.close();}
});

test('부분 첨부 실패·HEIC 재시도·중복 CSV 열·CP949 실제 파일',async({page})=>{
  await login(page,'staff1@demo.local');await page.goto('/#/new');
  await page.getByLabel('물품 이름 *',{exact:true}).fill('파일 오류 검수용 합성 초안');await page.getByRole('button',{name:'비공개 초안 저장',exact:true}).click();
  await expect(page).toHaveURL(/\/edit$/);
  const png=await sharp({create:{width:30,height:30,channels:3,background:'#eee'}}).png().toBuffer();
  await page.locator('.upload-control input').nth(0).setInputFiles([{name:'저장성공.png',mimeType:'image/png',buffer:png},{name:'오류.heic',mimeType:'image/heic',buffer:Buffer.from('unsupported')}]);
  await toast(page,'1개는 저장되었습니다');await expect(page.getByAltText('저장성공.png')).toBeVisible();await expect(page.locator('.toast')).toContainText('JPEG로 변환');
  await page.locator('.upload-control input').nth(0).setInputFiles({name:'오류.heic',mimeType:'image/heic',buffer:Buffer.from('unsupported')});await toast(page,'JPEG로 변환');
  const apiPath='/api'+new URL(page.url()).hash.slice(1).replace(/\/edit$/,'');
  const current=await (await page.request.get(apiPath)).json();const session=await (await page.request.get('/api/auth/me')).json();
  const changed=await page.request.put(apiPath,{headers:{Origin:new URL(page.url()).origin,'X-CSRF-Token':session.csrf},data:{...current.data,version:current.version,description:'다른 담당자가 먼저 저장한 합성 수정'}});expect(changed.ok()).toBeTruthy();
  await page.getByRole('button',{name:'비공개 초안 저장',exact:true}).click();await toast(page,'다른 담당자가 먼저 수정');await page.reload();await expect(page.getByRole('textbox',{name:'설명',exact:true})).toHaveValue('다른 담당자가 먼저 저장한 합성 수정');
  await page.getByRole('button',{name:'비공개 초안 저장',exact:true}).click();await toast(page,'초안을 저장');
  await page.goto('/#/inventory');await expect(page.getByRole('heading',{name:'대장 가져오기·자산 연결',exact:true})).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'중복열.csv',mimeType:'text/csv',buffer:Buffer.from('자산번호,대장품명,수량,수량\r\n001,의자,1,2')});await toast(page,'중복 열 이름');await expect(page.getByRole('button',{name:'검증 후 원본 저장'})).toHaveCount(0);
  // CP949 bytes for 자산번호,대장품명,수량 / 00009999,합성 의자,2.
  const cp949=Buffer.from('wNq76rn4yKMstOvA5cewuO0svPa3rg0KMDAwMDk5OTksx9W8uiDAx8DaLDINCg==','base64');
  await page.locator('input[type=file]').setInputFiles({name:'한글_CP949.csv',mimeType:'text/csv',buffer:cp949});
  await expect(page.getByText('한글_CP949.csv · 1행')).toBeVisible();
  await expect(page.getByLabel(/^자산번호 \*/)).toHaveValue('자산번호');
  await page.getByRole('button',{name:'검증 후 원본 저장',exact:true}).click();await toast(page,'신규 1행');
  await expect(page.getByLabel('00009999 선택')).toBeVisible();
});
