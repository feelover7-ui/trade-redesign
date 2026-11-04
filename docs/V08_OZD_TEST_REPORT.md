# v0.8 OZD HTML5 연동 코드 및 검증 기록 (2026-11-04)

코드 변경은 실제 제조사 OZ JS 런타임과 라이선스를 제공하지 않는다.
`OZD_ENGINE_KIND=OZ_HTML5`를 켜더라도 정식 설치된 `OZJSViewer.js`,
브라우저 실행파일, 이용 승인이 모두 있어야 엔진이 준비됨으로 표시된다.

신규 경로: `tools/ozd-bridge/html5-converter.mjs`은 loopback 임시 웹 서버와
OZ HTML5 Viewer의 `start_ozjs`, `connection.openfile`,
`ScriptEx(save_memorystream)`, `OZExportMemoryStreamCallBack`을 사용한다.
내부 브릿지가 OZP/OZD를 직접 해독하는 코드는 아니다.
원본을 HTTP 외부 호스트로 보내지 않고 loopback에서만 파일을 제공한다.
출력은 XLSX 형식/크기 및 기존 격리 파서와 연계해서 검증한다.

`tests/ozd-html5.test.mjs`: 라이선스/런타임 준비 전 차단·브릿지 상태와 서버 UI 분리·키 유출 방지.
`tests/e2e/ozd-html5.spec.ts`: 시험용 대역 OZJSViewer.js 로딩→데이터 전송→
XLSX 콜백→비공개 브릿지→앱 XLSX 경로의 접점 검사와 잘못된 변환 거부.

**시험용 OZ Viewer 대역만 사용**한다. 실제 사용자 OZD 파일을 이 외부
실행환경에 업로드하지 않았고, 실제 FORCS 전용 라이브러리를 설치하지 않았다.
따라서 실파일 자동변환 성공 여부, PDF/엑셀 내부 행 구조의 일치·완전성,
라이선스 적법성, 최종 NAS 배포는 Codex 현장 검증 대상이다.

## 실행한 테스트

- Node24 Linux `npm ci`: 통과.
- `npm test`: **108개 통과** (v0.7.1 기존106 + HTML5 연동/준비상태2).
- `npm run build`: TypeScript·Vite 통과.
- `npm run test:e2e`: **20개 통과** (기존18 + 가짜 SDK로 내부 브릿지/콜백2).
- `npm audit --audit-level=low`: 검사 시 알려진 취약점 **0건**.
- `git diff --check`: 공백 오류 없음.
- 테스트는 합성 파일/가짜 공급자 응답만 사용. 실제 OZ SDK, 실제 OZD,
  실제 DeepSeek/조달청 인증, 실제 NAS 배포는 테스트하지 않았다.
- UI는 기존 390px 모바일 파일 업로드·일반 대화창 반응형 테스트를 재실행했다.
  새 HTML5 도구는 백엔드 실행용이며 별도 화면 디자인 변경은 연결상태 표시뿐이다.
- 버전별 HTML5 OZ Viewer 라이선스·콜백 호환성과 실제 원문 대조는 사용자 승인
  환경의 Codex가 확인해야 한다. OSS로 OZD를 해독했다는 뜻이 아니다.

