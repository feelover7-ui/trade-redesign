# Codex 마무리 — v0.9 OZD 직접 변환

기준 main `9a538063de3f3e9e560f0c18358104baf78b656e`에서 이어진 변경이다. **이번 버전은 외부 OZ 프로그램/SDK/브릿지를 설치하지 않고 지원 소요조회 OZD를 직접 XLSX로 변환한다.** 이전 v0.8 엔진 설치 프롬프트 대신 이 문서를 따른다.

```text
https://github.com/h19h29-design/trade 최신 main의 v0.9에서 이어서 검수·배포해줘.
AGENTS.md, docs/OZD_NATIVE_V09.md, docs/V09_TEST_REPORT.md,
docs/CODEX_V09_NATIVE_OZD_HANDOFF.md, docs/NAS_DEPLOYMENT.md를 먼저 읽어.

1. 기존 작업트리·배포SHA·실제 DB/uploads/RAG/비밀설정 경로를 확인하고 보존해.
   .env/.env.nas/API키 전체 출력 금지. 이미 저장한 DeepSeek와 조달청 키를 재사용해.
   git pull --ff-only 전에 미커밋 작업을 보존해. reset --hard, prune, down -v,
   DB 초기화·덮어쓰기·사용자 자료 삭제 금지.

2. 이번에는 OZ Viewer/HTML5 SDK/Chrome/변환 서버가 필요하지 않아.
   server/ozd/native.mjs와 worker.mjs가 OZD를 직접 읽는다.
   OZD_LEGACY_BRIDGE_FALLBACK는 기본 false로 유지해. 기존 OZD_BRIDGE 설정을
   삭제할 필요는 없지만, 지원 파일은 외부 브릿지를 호출하지 않아야 해.

3. 사용자의 실제 소요조회등록.ozd 및 소요조회물품목록.xlsx가 로컬에 있으면
   npm run ozd:convert -- "소요조회등록.ozd" --output "소요조회등록_검증.xlsx"
   로 새 파일을 만들어 확인해. 이미 있는 출력 파일을 덮어쓰지 마.
   원본 OZD의 표와 변환표, 제공된 엑셀이 동일 목록일 때만 서로 대조해.
   물품번호·품명·등록수량·취득일·취득단가·폐품을 행별로 확인해.
   사용자 문서를 Git·공개 CI·외부 변환 사이트에 올리지 마.
   이 대화에서 실제 검증된 파일은 공개 교육청 OZD 1개15행165개이고,
   사용자 첨부파일은 아직 직접 검증하지 못했으니 이번에 구분해서 확인해.

4. 실제 웹화면에서 OZD 드래그 → 직접 변환 완료/행수/수량 → 변환 엑셀 받기 →
   등록 전 미리보기 → 비공개 초안 → 기존 조달청 키로 보완 → 상세페이지를 검수해.
   이전 변환대기 업로드도 이력에서 직접 변환 다시 시도로 처리해.
   다른 형식/비밀번호/손상은 일부만 추정해 성공 처리하지 않아야 해.
   재사용 판단·불용승인·게시 승인 조건은 기존대로 유지해.

5. npm ci, npm test, npm run build, npm run test:e2e를 실행해.
   데스크톱/390px 모바일, AI 대화창과 접힌 참고자료도 함께 검수해.
   테스트에 있는 예전 OZ HTML5 mock 경로와 네이티브 실제 변환 경로를 혼동하지 마.
   실제 조달청·AI 실접속은 로컬의 승인된 키로 별도 확인해.

6. schema4→5는 import_document_exports를 추가하는 비파괴 마이그레이션이야.
   기존 DB·uploads·RAG corpus·rag-usage.sqlite를 일관되게 백업하고,
   별도 경로 복원 검증 후 기존 NAS 앱만 업데이트해.
   다운그레이드 시 현재 DB를 지우지 말고 이전 코드+이전 백업을 새 경로에서 복원해.

7. 수정분은 코드만 커밋·푸시해. 실제 배포SHA/주소/사용자 OZD 행별 대조결과/
   조달청 실조회/AI 실응답/남은 제한을 구분해 보고해.
   서브에이전트 지원 시 입력·변환, 화면·API, 데이터보존 검수로 파일 소유권을 나누고
   통합 담당만 마이그레이션·lockfile·배포를 수정해.
```
