import {test,expect,type Page} from '@playwright/test';
async function login(page:Page,email='staff2@demo.local'){await page.goto('/');await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill('DemoTrade!2026');await page.getByRole('button',{name:'기관 계정으로 로그인'}).click();await expect(page.getByRole('heading',{name:'오늘 할 일',exact:true})).toBeVisible();await page.goto('/#/market');await expect(page.getByRole('heading',{name:'우리 학교에 필요한 물품을 찾아보세요'})).toBeVisible();}
test('desktop market, search, detail and application persist',async({page})=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);await expect(page.locator('.lot-card')).toHaveCount(6);await page.screenshot({path:'test-results/desktop-market.png',fullPage:true});await page.getByLabel('물품 검색').fill('강당 의자');await expect(page.locator('.lot-card')).toHaveCount(1);await page.locator('.card-title').click();await expect(page.getByRole('heading',{name:'강당 의자, 필요한 만큼 나눠요'})).toBeVisible();await page.getByLabel('필요 수량',{exact:true}).fill('3');await page.getByLabel('사용 목적',{exact:true}).fill('시연 교실에서 재사용합니다');await page.getByLabel('인수 희망일').fill(new Date(Date.now()+86400000*7).toISOString().slice(0,10));await page.getByRole('button',{name:'받기 신청',exact:true}).click();await expect(page.locator('.badge').filter({hasText:'신청 접수'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'신청 내용',exact:true})).toBeVisible();await page.screenshot({path:'test-results/desktop-case.png',fullPage:true});expect(errors).toEqual([]);});
test('draft creation and persistence without any external service',async({page})=>{await login(page,'staff1@demo.local');await page.goto('/#/new');await page.getByLabel('물품 이름 *',{exact:true}).fill('E2E 새 물품 초안');await page.getByLabel('설명',{exact:true}).fill('외부 연결 없이 저장하는 테스트');await page.getByRole('button',{name:'비공개 초안 저장',exact:true}).click();await expect(page).toHaveURL(/#\/lots\/[^/]+\/edit$/);await page.reload();await expect(page.getByLabel('물품 이름 *',{exact:true})).toHaveValue('E2E 새 물품 초안');await expect(page.getByRole('button',{name:'현물사진 추가'})).toBeVisible();});
test('mobile navigation and layout fit 390px',async({page})=>{await page.setViewportSize({width:390,height:844});await login(page);await expect(page.locator('.bottom-nav')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();await page.screenshot({path:'test-results/mobile-market.png',fullPage:true});await page.locator('.bottom-nav').getByRole('link',{name:'더보기'}).click();await expect(page.getByRole('heading',{name:'연결·설정',exact:true})).toBeVisible();await expect(page.locator('.integration-list b')).toHaveCount(4);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();await page.getByRole('link',{name:'대장 가져오기',exact:true}).click();await expect(page.getByRole('heading',{name:'대장 가져오기·자산 연결'})).toBeVisible();});
test('admin can manage institutions but has no business approval UI',async({page})=>{await page.goto('/');await page.getByLabel('이메일',{exact:true}).fill('admin@demo.local');await page.getByLabel('비밀번호',{exact:true}).fill('DemoTrade!2026');await page.getByRole('button',{name:'기관 계정으로 로그인'}).click();await expect(page.getByRole('heading',{name:'기관·담당자 관리'})).toBeVisible();await expect(page.getByRole('heading',{name:'등록된 기관'})).toBeVisible();await expect(page.locator('.sidebar a').filter({hasText:'물품 올리기'})).toHaveCount(0);});

test('v06 synthetic Excel picture mapping, department and upload history',async({page})=>{
 const {pictureWorkbook}=await import('../fixtures/workbook-pictures.mjs');
 await login(page,'staff1@demo.local');await page.goto('/#/new');
 await page.getByTestId('excel-upload').setInputFiles({name:'synthetic-picture.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:await pictureWorkbook()});
 await expect(page.getByLabel('머리글 행 번호')).toHaveValue('3');await page.getByRole('button',{name:'등록 전 검증·미리보기'}).click();
 await expect(page.getByRole('heading',{name:'물품 2묶음 · 총 30개'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'엑셀 삽입 사진 1장 · 연결할 행 확인'})).toBeVisible();
 await page.getByLabel('사진 4행의 연결 대상').selectOption('4');
 await expect(page.getByRole('button',{name:'선택 사진을 등록한 초안에 연결'})).toBeDisabled();
 await page.getByRole('button',{name:'검증한 물품 초안 등록'}).click();await expect(page.getByText('초안을 등록했습니다. 2묶음')).toBeVisible();
 await page.getByLabel('선택한 사진이 연결할 행의 실제 물품사진임을 확인했습니다.').check();
 await page.getByLabel('얼굴·이름표·보안정보가 없는 사진인지 확인했습니다.').check();
 await page.getByRole('button',{name:'선택 사진을 등록한 초안에 연결'}).click();await expect(page.locator('.toast')).toContainText('사진을 초안에 연결');
 await page.getByRole('link',{name:'1번 물품 작성',exact:true}).click();
 await expect(page.getByLabel('물품 이름 *',{exact:true})).toHaveValue('회의의자');await expect(page.getByLabel('보관 부서',{exact:true})).toHaveValue('도서실');await expect(page.locator('.editor-photos img')).toHaveCount(1);
 await page.goto('/#/stock');await expect(page.getByRole('heading',{name:'부서별 등록·재고 현황'})).toBeVisible();
 await page.getByLabel('보관 부서 필터').selectOption('도서실');await expect(page.locator('tbody tr')).toHaveCount(1);
 await page.screenshot({path:'test-results/v06-stock-desktop.png',fullPage:true});
 await page.goto('/#/imports');await expect(page.locator('tbody')).toContainText('synthetic-picture.xlsx');
});

test('v06 mobile list toggle, registration lookup status and inventory navigation',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page);
 await page.getByRole('button',{name:'목록형',exact:true}).click();await expect(page.locator('table')).toBeVisible();
 await page.getByRole('button',{name:'카드형',exact:true}).click();await expect(page.locator('.lot-card').first()).toBeVisible();
 for(const route of ['stock','imports','new']){
  await page.goto('/#/'+route);await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 }
 await expect(page.getByRole('button',{name:'등록용 조달정보 조회'})).toBeDisabled();
 await page.screenshot({path:'test-results/v06-new-mobile.png',fullPage:true});
});
