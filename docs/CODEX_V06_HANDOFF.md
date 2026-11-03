# Codex 인계 — v0.6 HTML 기능통합과 조달 API 실제 연결

아래 지시를 물품이음 저장소의 Codex에서 수행한다. 이 작업은 코드 커밋·검증까지이며 NAS 배포와 real-key 조회는 아직 하지 않았다.

```text
프로젝트 https://github.com/h19h29-design/trade 의 최신 main을 확인해 v0.6을 마무리해줘.
AGENTS.md, docs/HTML_INTEGRATION_V06.md, docs/V06_TEST_REPORT.md,
docs/NAS_DEPLOYMENT.md, docs/CODEX_RAG_HANDOFF.md를 먼저 읽어줘.
기존 내 미커밋 수정사항·DB·uploads·기관·계정·Cloudflare·HTTPS·Docker 네트워크·RAG corpus를 보존해.

1. git status/remote/log와 실제 소스·DATA_DIR·배포 이미지를 확인하고 최신 main과 비교해.
   기존 코드나 데이터 삭제·초기화, reset --hard, down -v, prune은 하지 마.
2. Node24, npm ci, npm test, npm run build, Chromium E2E를 실행해.
   합성 테스트는 실자료 DB와 분리해. 실제 비식별 엑셀에서도 열 이름과 8-8 목록번호를 확인해.
3. 내가 로컬 보안설정에 넣은 조달청 키를 DATA_GO_KR_SERVICE_KEY로 서버에만 설정해.
   PROCUREMENT_ENABLED=true는 활용신청/키가 확인된 때만 설정해.
   VITE 변수·브라우저·로그·Git·보고서에 키나 키가 포함된 URL을 노출하지 마.
   기존 .env/.env.nas를 통째로 덮어쓰거나 출력하지 말고 필요한 항목만 편집해.
4. 기본 파라미터 PROCUREMENT_KEY_PARAM=serviceKey를 유지하고 승인받은 최신 명세를 대조해.
   대소문자만 추측해 바꾸지 말고 실제 인증 실패 원인을 구분해.
   선택한 테스트 물품번호1개로 실제 조회 후 품명·식별번호·제조사·출처를 확인해.
   번호없음, 잘못된 키, 401/403/429, XML 오류, 응답 지연, 검색결과0건도 구분해서 확인해.
5. 등록 화면에서 목록번호·품명 조회→선택 정보 입력→초안 저장을 직접 조작해.
   엑셀에서는 부서/기관 대조→사진후보의 행 선택→초안 등록→현물/개인정보 확인→사진 연결을 검수해.
   조달청 참고사진은 이용조건 확인 후 PROCUREMENT_IMAGE_RIGHTS_CONFIRMED=true로 켜고,
   후보를 선택해 참고사진으로 저장되는지 확인해. 실제 현물사진을 대체하거나 게시승인을 통과시키지 마.
6. 일괄보완은 최대50초안·캐시·현재요청 후 중단·번호일치 빈칸 반영·충돌거부를 확인해.
   같은 물품이 다른 부서/회계/결정인 경우 잘못 합쳐지지 않는지 확인해.
   실제 대장에 유사 제품 코드가 들어 있을 수 있으므로 식별번호 일치만으로 현물을 확정하지 마.
7. 기존 승인된 NAS 구성만 사용해 백업/복원 확인 후 업데이트해. schema2→3 추가 변경이 있다.
   롤백은 업데이트 전 백업을 새 경로에 복원해 이전 이미지와 연결하고 현재 DB는 보존해.
   DATA_DIR 외 RAG corpus와 usage DB도 별도 보존해. RAG/사진 AI 공급자 설정을 덮어쓰지 마.
8. 1440px 데스크톱/390px 모바일에서 장터 카드·목록, 부서 재고, 업로드 이력,
   등록·사진·조달보완·기존 신청/인계/RAG/배송을 실제 브라우저로 확인해.
9. 수정 코드만 커밋·푸시하고 배포SHA/실행주소/서버버전/테스트 결과/실호출 확인범위와
   필요한 승인·설정을 구분해 보고해. 실호출·배포하지 않은 것을 완료라고 쓰지 마.
```

## 환경설정 구분

기존 DATA_GO_KR_SERVICE_KEY를 그대로 사용한다. 실제 키 값은 이 문서에 쓰지 않는다.

| 변수 | 기본/의미 |
|---|---|
| PROCUREMENT_ENABLED | false, 실제 이용승인·키 설정 후 true |
| PROCUREMENT_KEY_PARAM | serviceKey, 공식 파라미터 이름. 확인 없이 변경하지 않음 |
| PROCUREMENT_IMAGE_RIGHTS_CONFIRMED | false, 사진 재사용 조건 확인 후 true |
| PROCUREMENT_DAILY_LIMIT | 300, 기관별 실제 외부조회 일일 상한 |
| PROCUREMENT_GLOBAL_DAILY_LIMIT | 800, 전체 실제 외부조회 일일 상한 |
| PROCUREMENT_CACHE_TTL_SECONDS | 21600, 정상 조회 캐시6시간 |

NAS Compose에 위 환경변수 전달을 추가했다. 기존 RAG override는 유지한다. 실제 키가 없으면 등록화면에서 조회 버튼이 비활성화되며 엑셀/수동 등록은 동작한다. 실제 제공자가 반환하지 않는 모델명·치수·중량은 비워 둔다.

첨부 HTML의 내장 업무자료·사진·자산번호는 저장소에 옮기지 않았다. 실제 데이터 가져오기는 승인된 엑셀을 통해 기관 내부 초안으로 진행한다.
