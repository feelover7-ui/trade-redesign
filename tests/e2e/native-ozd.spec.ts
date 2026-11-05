import {test,expect,type Page} from '@playwright/test';
import {makeOzd,syntheticRows} from '../fixtures/native-ozd.mjs';
import {startExternalTestServer} from '../fixtures/v07-external-server.mjs';
import * as XLSX from 'xlsx';
import {readFileSync} from 'node:fs';
async function login(page:Page,url='/'){await page.goto(url);await page.getByLabel('이메일',{exact:true}).fill('staff1@demo.local');await page.getByLabel('비밀번호',{exact:true}).fill('DemoTrade!2026');await page.getByRole('button',{name:'기관 계정으로 로그인'}).click();await expect(page.getByRole('heading',{name:'오늘 할 일',exact:true})).toBeVisible();await page.evaluate(()=>{location.hash='#/market';});await expect(page.getByRole('heading',{name:'우리 학교에 필요한 물품을 찾아보세요'})).toBeVisible();}
async function drop(page:Page,bytes:Buffer){const dt=await page.evaluateHandle(bytes=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],'소요조회_네이티브.ozd',{type:'application/octet-stream'}));return data;},Array.from(bytes));await page.getByTestId('excel-upload-dropzone').dispatchEvent('drop',{dataTransfer:dt});await dt.dispose();}
test('OZD만 드래그→내부 직접변환→XLSX 다운로드→원본 검증→초안 (외부 엔진 없음)',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);await page.goto('/#/new');await drop(page,makeOzd());
 await expect(page.getByText('OZD 직접 변환 완료 · 2행 / 33개')).toBeVisible();await expect(page.getByLabel('머리글 행 번호')).toHaveValue('1');
 const downloaded=page.waitForEvent('download');await page.getByRole('link',{name:'변환 엑셀 받기'}).click();const file=await downloaded;const bytes=readFileSync((await file.path())!);const book=XLSX.read(bytes,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(book.Sheets['소요조회물품목록'],{header:1}) as unknown[][];expect(rows[1][0]).toBe('56101703-00001234');expect(rows[1][5]).toBe('폐품');
 await page.getByRole('button',{name:'등록 전 검증·미리보기'}).click();await expect(page.getByRole('heading',{name:'물품 2묶음 · 총 33개'})).toBeVisible();await expect(page.locator('.import-validation')).toContainText('141000');
 await page.screenshot({path:'test-results/native-ozd-preview.png',fullPage:true});
 await page.getByRole('button',{name:'검증한 물품 초안 등록'}).click();await expect(page.getByText('초안을 등록했습니다. 2묶음')).toBeVisible();await page.getByRole('link',{name:'1번 물품 작성',exact:true}).click();await expect(page.getByLabel('실물 확인 수량 *',{exact:true})).toHaveValue('31');await page.getByRole('link',{name:'상세·게시 검토 화면'}).click();await expect(page.locator('main')).toContainText('폐품');expect(errors).toEqual([]);
});
test('네이티브 OZD→조달청 보완→상세 흐름, 변환 API 호출0 (조달청만 테스트 응답)',async({page})=>{
 const server=await startExternalTestServer();try{
 await login(page,server.url);await page.goto(server.url+'/#/new');const before=server.calls.ozd;const row={...syntheticRows()[0],THNG_NM:'합성 수납장',REQRE_INQIRE_QTY:'3'};await drop(page,makeOzd({rows:[row]}));await expect(page.getByText('OZD 직접 변환 완료 · 1행 / 3개')).toBeVisible();
 await page.getByRole('button',{name:'등록 전 검증·미리보기'}).click();await page.getByLabel('번호가 정확히 일치한 후보의 빈칸도 입력하기').check();await page.getByRole('button',{name:'검증한 물품 초안 등록'}).click();await expect(page.getByText('번호 일치 정보로 빈칸 입력 완료 · 실물 확인 필요')).toBeVisible();expect(server.calls.ozd).toBe(before);expect(server.calls.catalog).toBeGreaterThan(0);
 await page.getByRole('link',{name:'1번 물품 작성',exact:true}).click();await expect(page.getByLabel('실제 제조사',{exact:true})).toHaveValue('검증용 제조사');
 }finally{await server.close();}
});
test('390px OZD 직접변환 성공 및 비밀번호 파일 미등록 안내',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page);await page.goto('/#/new');await drop(page,makeOzd());await expect(page.getByRole('link',{name:'변환 엑셀 받기'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:'test-results/native-ozd-mobile.png',fullPage:true});
 await drop(page,makeOzd({password:'Protected'}));await expect(page.getByRole('heading',{name:'OZD 원본 보관 · 직접 변환 확인 필요'})).toBeVisible();await expect(page.getByText('비밀번호가 설정된 OZD는 직접 변환하지 않습니다. 비밀번호 없는 원본이 필요합니다.')).toBeVisible();await expect(page.getByRole('button',{name:'검증한 물품 초안 등록'})).toHaveCount(0);
});
