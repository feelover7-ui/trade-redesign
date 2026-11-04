# Codex 인계 — v0.7 파일 등록·일반 AI 대화창

기준: 2026-11-04, main의 v0.6 `8e249ed6b50285f733fe19c195358992e7ef76b6`에서 이어진 변경. **사용자는 기존 Codex 환경에 AI/조달청 키를 이미 설정했다. 다시 제출·공유하라고 하지 말고 존재 여부만 비노출로 확인한다.**

## 먼저 읽을 것

AGENTS.md → docs/V07_DOCUMENT_IMPORT_CHAT.md → docs/V07_TEST_REPORT.md → docs/NAS_DEPLOYMENT.md → tools/ozd-bridge/README.md. RAG 배포가 아직 이전 버전이라면 docs/CODEX_RAG_HANDOFF.md도 함께 확인한다. README의 과거 배포기록을 새 코드의 배포 완료로 오해하지 않는다.

## 원샷 실행 지시

```text
https://github.com/h19h29-design/trade 의 최신 main에서 v0.7 작업을 마무리해줘.
처음부터 재작성하지 말고 구현된 파일 등록·조달정보·AI 대화창을 실행·검수·배포해.

0. AGENTS.md, docs/V07_DOCUMENT_IMPORT_CHAT.md, docs/V07_TEST_REPORT.md,
   docs/CODEX_V07_HANDOFF.md, docs/NAS_DEPLOYMENT.md,
   tools/ozd-bridge/README.md를 먼저 읽어.
   git status·현재 커밋·NAS 실제 배포 커밋·DATA_DIR·uploads·RAG 경로·포트를 확인해.
   미커밋 작업을 보존하고 git pull은 ff-only로 진행해. 충돌 시 덮어쓰지 말고 보고해.

1. API 키는 이미 이 Codex 환경에 넣었다.
   .env / .env.nas / 비밀설정에서 실제 사용 경로와 설정 여부만 확인해.
   파일 전체 내용, 키값, 키가 포함된 URL, docker compose config의 비밀값을 출력하지 마.
   키를 새로 달라고 반복 요청하거나 임의로 재발급하지 마.
   기존 DeepSeek 모델 ID·공급자·사진 AI·카카오 설정을 임의 교체하지 마.
   새로 필요한 비밀값은 OZD 브릿지 전용 토큰이며 기존 API 키와 별개야.

2. npm ci, npm test, npm run build, 브라우저 테스트를 실행해.
   실제 사용자 파일 소요조회물품목록.xlsx가 로컬에 있으면 그 파일로 검사해.
   업로드한 행의 G2B목록번호·G2B목록명·등록수량·취득일·취득단가·폐품 상태를
   원본과 대조해. 빈 번호/중복 번호/단가가 다른 행을 임의 합치지 마.
   실제 파일은 Git·공개 테스트 데이터·외부 AI에 올리지 마.

3. 조달청 기존 서버 키와 활용승인을 확인하고 설정된 공식 endpoint로 1건부터 실조회해.
   파일 드래그→원본 표→초안→번호 조회→선택한 빈칸 입력을 직접 조작해.
   자동 입력은 정확 식별번호 후보와 빈칸만. 원본 번호·수량·취득단가·원본 상태는 보존해.
   품명 후보는 수동 확인하게 하고 실패 시 초안은 남아야 해.
   대량 조회 중단·캐시·51개 이상 다음 묶음·401/403/429·빈 결과를 검수해.
   참고사진은 이용조건 확인 후 별도 참고사진으로만 연결해.

4. OZD는 조달청 키만 넣는다고 읽히지 않는다.
   실제 소요조회등록.ozd와 허가된 OZ Viewer/Report 내보내기 엔진이 로컬에 있는지 확인해.
   엔진 버전·라이선스와 공식적으로 허용된 자동 내보내기 방식부터 검증해.
   tools/ozd-bridge/server.mjs는 내부 통신 래퍼이지 실제 OZ 변환 엔진이 아니다.
   해당 엔진의 OZD→XLSX 내보내기를 수행하는 어댑터를 로컬에서 연결해.
   존재하지 않는 CLI 옵션, ProgID, API URL을 만들거나 임의 바이너리를 내려받지 마.
   shell:false와 정적 실행파일·인수, 전용 저권한 사용자/격리·망 제한을 유지해.
   테스트용 fake converter를 운영에 연결하지 마.
   OZD_BRIDGE_*와 엔진 설정을 필요한 경우에만 추가해. .env 전체를 덮어쓰지 마.
   실제 OZD→변환표→원본 행·품명·번호·수량 대조를 통과한 후 활성화해.
   엔진/라이선스를 확보하지 못하면 정확한 부족사항을 보고하고 원본보관·변환대기 및
   같은 OZD에서 저장한 XLSX 연결 기능은 유지해. 자동변환 완료라고 쓰지 마.

5. 기존 DeepSeek RAG 설정·모델을 그대로 사용해 실응답을 검사해.
   프로그램 안내부터 확인한 뒤 전송이 승인된 지침만 평가해.
   답변은 일반 대화형이며 [S1] 등의 인용문구는 본문에 표시되면 안 돼.
   ‘참고자료’ 버튼을 누르기 전에는 원문·출처목록이 닫혀 있어야 하고,
   열었을 때 근거·서식·기능 이동이 실제로 작동해야 해.
   Enter/Shift+Enter/한글 조합, 복사, 오류, 새 대화, 모바일390px를 확인해.
   외부 이미지/HTML/임의 링크 실행을 허용하지 마.
   원문 근거ID 검증·권한을 없애지 마.

6. 기존 SQLite·uploads·계정·Cloudflare·HTTPS·다른 서비스·RAG corpus를 보존해.
   DB schema4 추가 마이그레이션 전 일관된 백업을 만들고 새 경로에 복원 검증해.
   신규 업로드 원본이 SQLite import_documents에 들어가 백업 용량이 늘 수 있어.
   corpus와 rag-usage.sqlite는 별도 보존하고 down -v, reset --hard, prune, DB 초기화 금지.
   검증한 앱만 기존 NAS 서비스에 업데이트해. 새로운 외부 배포 대상을 만들지 마.
   실패 시 현재 DB를 지우지 말고 이전 코드+이전 백업을 새 경로로 복원해.

7. 코드 수정분만 커밋·푸시해. 마지막에 실제 배포 커밋/실행주소/테스트 결과,
   조달청 실조회 여부/실제 AI 모델/실제 OZD 변환 여부를 각각 구분해 보고해.
   키·개인정보·내부 파일·원본 번호 목록을 보고서에 노출하지 마.
```

## 연결 설정 구분

`DATA_GO_KR_SERVICE_KEY` 및 `PROCUREMENT_*`: 기존 조달청 서버 설정 재사용.
`DEEPSEEK_API_KEY`, `RAG_MODEL`, `RAG_*`: 기존 AI/자료 공유·외부 전송 설정 재사용.
`OZD_BRIDGE_ENABLED/APPROVED/URL/TOKEN/TIMEOUT_MS`: 새 비공개 변환 서버 연결. URL/token 값은 클라이언트로 내려보내지 않는다.
변환 호스트의 `OZD_ENGINE_APPROVED`, `OZD_CONVERTER_EXECUTABLE`, `OZD_CONVERTER_ARGS_JSON`: 설치된 허가 엔진의 실제 호출을 검증한 뒤 설정. README의 `{input}`, `{output}`은 우리 래퍼 자리표시자이지 OZ 제품의 명령행 옵션이 아니다.

배포 버전이 v0.3처럼 오래된 상태일 수 있으므로 0.4/0.5/0.6의 기능·스키마도 포함해 통합 검사한다. 작업장치의 임시 시연 DB와 실제 NAS 운영 데이터는 분리한다.
