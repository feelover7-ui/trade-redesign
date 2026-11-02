import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
async function login(page:Page,email='staff1@demo.local'){
  await page.goto('/');await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill('DemoTrade!2026');await page.getByRole('button',{name:'기관 계정으로 로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:email==='admin@demo.local'?'기관·담당자 관리':'우리 학교에 필요한 물품을 찾아보세요',exact:true})).toBeVisible();
}
test('개선사항 사진·문서 접수, 실패 입력 보존·재시도·관리자 답변·다운로드',async({page,browser})=>{
  await login(page);await page.locator('.sidebar').getByRole('link',{name:'개선사항',exact:true}).click();
  const title='합성 검수: 모바일 첨부 버튼 개선';await page.getByLabel('개선사항 제목',{exact:true}).fill(title);await page.getByLabel('개선사항 내용').fill('합성 자료로 개선사항과 사진·파일 첨부가 함께 저장되는지 확인합니다.');await page.getByLabel('관련 화면 (선택)',{exact:true}).fill('개선사항');
  const image=await sharp({create:{width:120,height:80,channels:3,background:'#d6ece2'}}).png().toBuffer();
  await page.getByTestId('feedback-files').setInputFiles([{name:'한글_화면.png',mimeType:'image/png',buffer:image},{name:'개선설명.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSYNTHETIC FEEDBACK\n%%EOF')}]);
  const fail=async(route:import('@playwright/test').Route)=>{if(route.request().method()==='POST')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'합성 검수 저장 실패'})});else await route.continue();};
  await page.route('**/api/feedback',fail);await page.getByRole('button',{name:'개선사항 접수하기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('입력한 내용과 선택한 파일은 유지');await expect(page.getByLabel('개선사항 제목',{exact:true})).toHaveValue(title);await expect(page.getByRole('button',{name:'한글_화면.png 선택 취소',exact:true})).toBeVisible();
  await page.unroute('**/api/feedback',fail);await page.getByRole('button',{name:'개선사항 접수하기',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'첨부파일 2개',exact:true})).toBeVisible();
  const url=page.url();await page.reload();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByAltText('한글_화면.png',{exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('link').filter({hasText:'개선설명.pdf'}).click();expect((await download).suggestedFilename()).toBe('개선설명.pdf');
  const admin=await browser.newPage({baseURL:new URL(url).origin});try{
    await login(admin,'admin@demo.local');await admin.getByRole('link',{name:'개선사항 확인',exact:true}).click();await admin.getByRole('link').filter({has:admin.getByRole('heading',{name:title,exact:true})}).click();await admin.getByRole('combobox',{name:'처리 상태',exact:true}).selectOption('DONE');await admin.getByLabel('운영관리자 답변',{exact:true}).fill('합성 검수: 첨부와 처리 상태 저장을 확인했습니다.');await admin.getByRole('button',{name:'처리 내용 저장',exact:true}).click();await expect(admin.locator('.toast')).toContainText('저장했습니다');
  }finally{await admin.close();}
  await page.reload();await expect(page.locator('.feedback-reply')).toContainText('첨부와 처리 상태 저장');await expect(page.locator('.page-heading')).toContainText('반영 완료');
});
test('390px 더보기에서 개선사항 접근, HEIC 실패·선택 취소 후 재접수와 가로 넘침 없음',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page,'staff2@demo.local');await page.getByRole('navigation',{name:'모바일 메뉴'}).getByRole('link',{name:'더보기',exact:true}).click();await page.locator('.mobile-links').getByRole('link',{name:'개선사항',exact:true}).click();
  await expect(page.getByRole('heading',{name:'개선사항',exact:true})).toBeVisible();await page.getByLabel('개선사항 제목',{exact:true}).fill('모바일 합성 개선 의견');await page.getByLabel('개선사항 내용').fill('휴대전화에서 첨부 실패 후 다시 접수할 수 있는지 확인하는 합성 의견입니다.');
  await page.getByTestId('feedback-files').setInputFiles({name:'사진.heic',mimeType:'image/heic',buffer:Buffer.from('SYNTHETIC HEIC')});await page.getByRole('button',{name:'개선사항 접수하기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('JPEG로 변환');await page.getByRole('button',{name:'사진.heic 선택 취소',exact:true}).click();
  await page.getByTestId('feedback-files').setInputFiles({name:'모바일_의견.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC MOBILE FEEDBACK')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:'test-results/feedback-mobile-form.png',fullPage:true});
  await page.getByRole('button',{name:'개선사항 접수하기',exact:true}).click();await expect(page.getByRole('heading',{name:'모바일 합성 개선 의견',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'첨부파일 1개',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
