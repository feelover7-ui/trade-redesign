# v0.9 직접 OZD 변환 검증 — 2026-11-04

> NAS 통합의 실제12,380바이트 사용자 OZD는1행/1개·9셀 독립 대조와 웹 드래그/기존 대기 재변환·조달 실조회를 통과했습니다. 서버150개·빌드·Chrome E2E27개, 통합 schema6 보존 결과는 [V09_COMPLETION.md](V09_COMPLETION.md), 최종 배포/복구는 [NAS_DEPLOYMENT.md](NAS_DEPLOYMENT.md)의 최신 기록을 먼저 읽으세요. 아래15행/165개·121개/23개·schema5 기록은 main 최초 구현의 공개 표본 검사입니다.

기반 main: 9a538063de3f3e9e560f0c18358104baf78b656e. Node24/Linux/Chromium. 사용자 NAS·DB·키·비공개 문서를 변경하지 않았다.

## 실파일 검증 (mock 아님)

교육청 공개 게시물 https://open.gwe.go.kr/main/bbs/view.do?bbsSn=29593&key=m2307210722956 의 OZD 첨부 1개를 사용했다. 13,256바이트, SHA-256 `59f578d4edf721b0a92f213371430c9e41e5932086b94086f60ca3b2321de041`.

Node 직접 파서가 **15행 / 수량합계165개**를 XLSX로 생성했다. 별도로 Python으로 판독한 OZD 원시 필드와 생성 XLSX를 **15행×9열=135셀 전체 대조해 일치**했다. OZD 원본과 전용 뷰어 JS는 공개 소스에 복사하지 않았다. 프로그램 외부 변환 호출·OZ SDK 실행·AI 추정은 **0회**다. 검증 메타데이터는 `docs/evidence/native-ozd-public-summary.json`에 있다.

이는 **원시 저장 데이터와 생성 표의 비교**이며 OZ Viewer 화면 렌더링을 수행해 눈으로 비교한 결과는 아니다. 사용자 첨부 13,505바이트 OZD와 20행 엑셀은 로컬 파일 실행 도구 오류로 직접 대조하지 못했다. 공개 표본의 검증을 사용자 파일 검증이라고 말하지 않는다.

## 자동 검사

| 검사 | 결과 |
|---|---|
| npm test | **121개 통과** (기존108 + native13) |
| TypeScript/Vite build | 통과 |
| Playwright Chromium | **23개 시나리오 통과** (기존20 + native3) |
| npm audit --audit-level=low | 실행 시 알려진 취약점0건 |
| git diff --check | 공백 오류 없음 |

신규 단위/HTTP: OZP 실제 구조 합성 fixture→XLSX, 양 포장 모드, 비밀번호/버전/손상/중복·겹침 디렉터리/gzipCRC/압축팽창/과다행/지원불가셀/다중표 거부, 앞자리0·원본상태·단가·수식형문자 보존, 외부 호출0, 원본 해시, 동일 원본 멱등 등록, 다운로드 권한·변조검사, 기존 대기파일 재변환, schema4→5 원본보존.

신규 브라우저: DataTransfer로 **실제 포장 구조의 합성 OZD** 드래그→내부 파서→완료/행수/수량→생성 XLSX 다운로드→원본 상태/단가 미리보기→비공개 초안→상세페이지. 별도 시나리오에서 조달청만 모의응답으로 주고 OZD 변환 호출0인지 검사했다. 390px 모바일 넘침 및 암호 문서의 안내·미등록도 검사했다. 기존 RAG/엑셀사진/배송/인계·인수·대장/기관격리 검사는 유지했다.

CI의 synthetic OZD는 테스트 전용 자체 writer가 만드는 파일이다. public/vendor/사용자 파일은 CI에 들어가지 않는다. 이전 HTML5/bridge 모의 검사는 명시적 legacy 옵션에서만 회귀검사용으로 유지되며, 새 native 실파일 검증과 구분한다.

## 화면 검수 및 남은 범위

Browser connector는 탭 읽기만 제공해 실행환경 Playwright를 사용했다. 1440×1000/390×844에서 DOM·오류·상호작용·가로넘침을 검사했다. `test-results/native-ozd-preview.png` / `native-ozd-mobile.png` 캡처는 CI 산출물로 남긴다. 로컬 이미지 표시 도구가 실패하여 별도 육안 대조는 완료하지 못했다. 실제 NAS 화면과 사용자 OZD는 Codex 최종검수 대상이다.

형식 지원은 비밀번호 없는 OZP3.0.0.1 / SDM2040 / ByteArraySet 소요조회 단일 표로 한정한다. 다른 버전/암호/다중표/이미지형 보고서를 지원한다고 주장하지 않는다. 보고서 스크립트/레이아웃/표시값 변경은 실행하지 않는다. 실제 조달청·DeepSeek 키를 사용하는 인증 및 운영 NAS 배포·복원 검사는 이번에 실행하지 않았다. 기관 보안심사나 행정적 사용승인이 완료됐다는 뜻이 아니다.
