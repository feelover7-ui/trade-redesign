# 물품이음 v0.8 · OZD 실제 변환 엔진 연결 Codex 인계

v0.7.1 commit `c9fdbe11421828759f780870bd36b010d91bdc35`에서 이어서
**OZ HTML5 Viewer의 공개 문서에 나온 API를 호출하는 비공개 자동변환 어댑터**를 추가했다.
실제 FORCS OZ Viewer SDK/라이선스가 없으므로 **사용자의 OZD 실변환 검증은 아직 완료되지 않았다.**
이번 신규 코드는 `tools/ozd-bridge/html5-converter.mjs`; 기존
`tools/ozd-bridge/server.mjs`의 `OZD_ENGINE_KIND=OZ_HTML5`를 통해 호출된다.
자격이 없으면 정상적으로 `ENGINE_NOT_CONFIGURED` 또는 `WAITING`을 돌려준다.

## Codex 원샷 지시

```text
https://github.com/h19h29-design/trade 최신 main에서 이어서 실제 OZD 자동변환과 배포를 완성해줘.
우선 AGENTS.md, tools/ozd-bridge/README.md,
docs/V07_DOCUMENT_IMPORT_CHAT.md, docs/CODEX_V071_FINISH.md,
docs/CODEX_V08_OZD_HTML5_HANDOFF.md, docs/NAS_DEPLOYMENT.md를 읽어.

사용자의 실제 소요조회등록.ozd는 K-에듀파인/OZ Viewer에서 나온 것이야.
OZD만 넣으면 제품명/번호/수량이 추출되고, 조달청 정보를 보완해
비공개 물품 초안을 만드는 것이 최종 목표야. 수동 XLSX 재첨부를 유일한 방법으로 강요하지 마.

1. 기존 데이터베이스·uploads·RAG·설정·터널·다른 Docker 서비스를 절대로
   삭제/초기화/덮어쓰지 마. git status, 실제 NAS 데이터 경로·버전,
   사용자 승인·백업·새 경로 복원 검증부터 실행해.
2. 별도 변환 호스트에서 설치된 FORCS OZ Viewer/Report의 실제 배포 파일,
   HTML5 OZJSViewer.js 및 종속 JS/CSS·라이선스·호출 가능성을 확인해.
   사용자 기관에서 이용승인된 공식 설치본만 사용하고 원본 OZD를 외부 변환
   사이트로 전송하지 마. 미설치면 확인된 자료를 바탕으로 설치/권한 필요 조건을 정확히 보고해.
3. 승인된 HTML5 SDK가 있다면, tools/ozd-bridge/html5-converter.mjs의
   start_ozjs, SetOZParameters, connection.openfile, ScriptEx save_memorystream,
   OZExportMemoryStreamCallBack의 실제 버전별 인수·결과를 테스트해.
   브릿지는 OZD_ENGINE_KIND=OZ_HTML5 설정으로 기존 private /convert를 호출한다.
   npm run ozd:html5:check, 인증된 GET /health와 업로드 후 실제 OZD→XLSX
   결과를 검증한 다음에만 OZD_BRIDGE_ENABLED/APPROVED=true로 활성화해.
   무작정 빈 엑셀 생성·가짜 성공은 금지. 코드 결함이 발견되면 수정·테스트해.
4. 실제 OZD 변환표의 물품명, G2B목록번호, 물품식별번호, 수량, 취득단가,
   물품상태(폐품)를 K-에듀파인 원본과 대조해. 자동변환 뒤 기존 XLSX 파서,
   원본 보존, 조달청 번호조회, 정확번호 빈칸 입력, 비공개 초안 검토,
   타 기관 검색/상세 공개의 전체 흐름을 확인해.
   실제 변환 파일의 품명/번호/행수가 다르면 운영 기능을 활성화하지 마.
5. 기존 Codex 환경에 DeepSeek/조달청 키가 이미 있어. 값을 재요청하거나
   출력·커밋·로그 기록하지 말고 서버 내 설정 존재 여부만 확인해 재사용해.
   OZ 엔진 사용권한과 API 키는 다른 것이야. OZD 전용 토큰만 별도로 비공개 설정해.
6. npm ci, npm test, npm run build, npm run test:e2e와
   npx playwright test tests/e2e/ozd-html5.spec.ts를 실행해.
   이 테스트의 가짜 OZ SDK를 실제 변환 완료 증거로 오인하지 마.
   사용자의 실제 OZD와 샘플 엑셀 대조가 별도로 필요해.
7. 검증 성공분만 코드 커밋·푸시하고 기존 NAS 환경에 백업 후 안전하게 배포해.
   작업 보고는 (a) OZD 실제 변환 가능/불가 근거와 원본대조 결과
   (b) 조달청 실조회 (c) DeepSeek 실응답 (d) NAS 배포SHA
   (e) 남은 권한·라이선스·환경 문제를 분리해 작성해.
   확인할 수 없는 SDK를 설치된 것으로 주장하거나 코드를 강제로 성공 처리하지 마.

가능하면 입력/OZD SDK, 조달API·DB, 화면·RAG의 서브에이전트에
파일별 소유권을 나눠 점검시키고, 통합 담당만 배포/공통 설정을 수정해.
```
