# Codex 인계 — 물품이음 RAG v0.5 설치·딥시크 연결

## 2026-11-02 최신 상태 — Hive 1017 연결 완료

현재 NAS 소스는 `919a706e14869c0ecfce9eee9dc45f160a0b52d7`(v0.5.2)이다. 사용자가 기존 OpenCode의 DeepSeek4.1 1017 키를 사용하도록 지시해 기존 Hive 키 파일을 읽기 전용으로 사용했고, NAS의 보호된 `.env.nas`에만 연결했다. 새 로그인이나 키 발급 없이 기존 키의 실제 API 응답으로 검증했다. OpenCode/Codex 자체 인증·모델·기존 사진 AI 설정은 바꾸지 않았다.

현재 `RAG_PROVIDER=hive`, `RAG_MODEL=deepseek-ai/deepseek-v4.1-flash-1017`, `RAG_AI_ENABLED=true`이며 서버의 `HIVE_API_KEY`를 사용한다. DeepSeek 직결 키와 혼용하거나 이전 기본값 `deepseek-flash`로 자동 교체하지 않는다. 공개 프로그램 안내9개만 서비스하며 기관 간 지침 공유는 계속 미확인이므로 `RAG_LIBRARY_ENABLED=false`를 유지한다. 실제20개 공개 안내 질문의 답변·근거 대조와 NAS `rag:check -- --live`, 데스크톱/모바일 실제 생성·후속 질문·출처/기능 이동을 확인했다. 아래 키 미제공 기록은 이전 시점이다. 최신 설정·백업복원·검사 한계는 [HIVE_RAG.md](HIVE_RAG.md), [NAS_DEPLOYMENT.md](NAS_DEPLOYMENT.md), [RAG_TEST_REPORT.md](RAG_TEST_REPORT.md)를 먼저 읽는다.

## 2026-11-01 NAS 후속 상태

앱 `d6bd5c9faef0d19bdee8db582da87df1750400a8` 배포·비공개 자료팩 설치·백업복원·검색 전용 공개 화면 검수까지 완료했습니다. 실제 경로와 증거는 [NAS_DEPLOYMENT.md](NAS_DEPLOYMENT.md)의 v0.5 기록을 먼저 읽으세요. 이전 릴리스·데이터·자료팩을 초기화하거나 아래 최초 설치를 그대로 반복하지 마세요.

사용자는 공개 안내/질문 및 지침의 DeepSeek 전송을 허용했고, 키는 나중에 제공하기로 했습니다. **기관 간 지침 공유는 아직 미확인**입니다. 실제 설정은 `RAG_EXTERNAL_APPROVED=true`, `RAG_LIBRARY_EXTERNAL_APPROVED=true`, `RAG_LIBRARY_ENABLED=false`, `RAG_AI_ENABLED=false`, `RAG_MODEL=deepseek-flash`입니다. 키 없이 생성 성공·계정 모델 검증·20개 실제 답변 평가를 완료했다고 기록하지 마세요.

키 제공 후 서버 비밀설정에서만 적용하고, 공식 `/models`에 선택 모델이 있는지 확인하세요. 공개 프로그램 안내만으로 `rag:check -- --live`를 먼저 검수하고 실제 답변20개 이상을 원문과 대조해야 합니다. 지침 전송 허용만으로 `RAG_LIBRARY_ENABLED`를 켜지 마세요. 공유 승인 전 지침 검수는 외부에 포트를 공개하지 않는 격리 검사에서만 수행하며, 서비스의 지침 검색·원본 URL은 계속 차단합니다. 실제 문의/답변과 발췌문은 비공개 검수 경로에만 보관하세요.

## 사용자에게 받아야 하는 것

코드는 GitHub main, 자료는 대화에 제공한 **물품이음_RAG_비공개자료_v0.5.zip**을 사용한다. 원본 자료를 다시 OCR할 필요는 없다. 자료 ZIP에 검색 index.sqlite·MD·manifest와 작은 원본 서식 후보3개가 있다. AI 호출을 위한 DeepSeek 키와 기관의 자료처리/공유/반출 허용은 별도 확인이 필요하다. 키 값을 채팅에 반복해서 출력하지 않는다.

## 작업 지시 — 그대로 실행할 프롬프트

```text
프로젝트: https://github.com/h19h29-design/trade
현재 최신 main의 v0.5 RAG 업무도우미를 기존 물품이음에 마무리해라.
앱을 새로 만들지 말고 AGENTS.md, README.md, docs/RAG_README.md,
docs/CODEX_RAG_HANDOFF.md, docs/NAS_DEPLOYMENT.md를 먼저 읽어라.

1. 저장소 git status/HEAD/remote와 현재 NAS 릴리스를 확인한다.
   사용자 수정·기존 DB·uploads·계정·다른 서비스·Cloudflare·HTTPS·포트·네트워크를 보존한다.
   기존 DATA_DIR와 백업 경로를 먼저 기록한다. DB 삭제/초기화/down -v/prune 금지.

2. 사용자가 내려받은 물품이음_RAG_비공개자료_v0.5.zip을 찾아 별도 비공개 버전 폴더에 해제한다.
   예시 /volume2/docker/trade/knowledge/v0.5-20261101 은 경로 제안일 뿐 실제 존재를 먼저 확인한다.
   index.sqlite가 들어있는 폴더를 TRADE_RAG_CORPUS_DIR로 지정한다.
   공개 Git·Docker 이미지·정적 public 폴더에 원문/MD/DB/zip을 넣지 않는다.
   자료가 학교 간 공유 가능한 참조 지침인지 개인정보·사례·권리·현행성을 검토한다.
   공유 승인이 없으면 RAG_LIBRARY_ENABLED=false로 유지하고 프로그램 안내만 검수한다.
   승인된 경우 읽기 전용 마운트와 RAG_LIBRARY_ENABLED=true를 설정한다.

3. Node24 + npm ci → npm test → npm run build → npm run test:e2e를 실행한다.
   npm run rag:check로 인덱스 SHA-256과 121문서/8164구간을 확인한다.
   프로그램 안내8개와 실제 지침의 D105 '소요조회 15일 권장',
   '물품관리전환합의서 서식', '조달청 무상 관리전환 표준서식' 검색을 확인한다.
   모든 지침은 현행성 미검증이다. 15일을 모든 사례의 법정 의무로 표시하면 안 된다.

4. DeepSeek 키를 서버 비밀설정에만 넣는다. Codex 자체의 인증/모델 설정은 바꾸지 않는다.
   DEEPSEEK_API_KEY, RAG_MODEL=deepseek-flash를 사용한다.
   공식 GET https://api.deepseek.com/models로 실제 접근 가능한 모델ID를 확인한다.
   사용자 선택인 DeepSeek4.1의 계정에서 확인된 ID만 사용한다. 없으면 원인을 보고하고 대체모델로 넘기지 않는다.
   키·전송 허용을 확보한 경우에만 RAG_AI_ENABLED=true, RAG_EXTERNAL_APPROVED=true로 켠다.
   npm run rag:check -- --live 는 공개 프로그램 안내만 전송해 연결과 JSON 인용 답변을 시험한다.
   지침 반출까지 허용된 경우에만 RAG_LIBRARY_EXTERNAL_APPROVED=true로 켠다.
   이 설정은 기존 제품사진 AI 공급자와 별개이므로 기존 사진 분석 코드를 덮어쓰지 않는다.

5. 기존 NAS 앱/네트워크 Compose를 유지하고 deploy/nas.rag.compose.yml을 추가한다.
   백업과 별도 복원 검사를 한 뒤 새 이미지·별도 릴리스로 변경한다.
   기존 /volume2/docker/trade/demo-data와 uploads를 보존하고 경로를 임의로 옮기지 않는다.
   기관간 데이터 노출·비로그인401·관리자403·CSRF·원본 다운로드 해시를 확인한다.
   생성 실패/429/잘못된 인용/미승인 반출이 성공 답변으로 표시되지 않는지 시험한다.
   1440px와 390px에서 질문→근거확인→후속 질문→원본/기능 이동을 직접 조작한다.
   실제 딥시크로 최소20개 질문을 평가하고 잘못된 수치/규정해석/근거가 있으면 기록·수정한다.
   근거ID가 맞는 것과 내용이 참인 것은 다르므로 사람의 원문 대조를 포함한다.

6. 검수 후 README와 검증 기록을 갱신하고 코드만 커밋·푸시한다.
   마지막에 배포 커밋·실행주소·실제 모델ID/표시명·검색문서수·인덱스해시·검사결과와
   미확보 승인/키/기능을 분리 보고한다. 실행하지 않은 배포·실접속을 완료라고 쓰지 않는다.
```

## 환경 및 백업 주의

`RAG_CORPUS_DIR`는 컨테이너 내부 `/app/rag-private`, `TRADE_RAG_CORPUS_DIR`는 NAS의 실제 corpus 디렉터리이다. ZIP에 포함된 최상위 폴더를 한 번 더 확인한다. .env.nas에 RAG변수를 넣는 것만으로 기존 Compose에 전달되지는 않으므로 제공한 override를 함께 사용한다. 새 경로가 잘못되면 자동으로 빈 디렉터리를 만들지 않게 `create_host_path:false`로 두었다.

앱의 trade.sqlite 마이그레이션은 추가하지 않았다. 지식 인덱스는 읽기 전용 별도 DB, 호출한도는 DATA_DIR/rag-usage.sqlite이다. 기존 backup.mjs가 호출한도 DB나 외부 corpus까지 백업한다고 가정하지 말고, 앱 중지 시 둘을 별도 안전 경로에 복사하고 해시 검증한다. 복원은 새 경로에서 시험한다. 지식 갱신은 새 버전 디렉터리 생성→검수→마운트 변경→재기동 방식이며 이전 버전은 삭제하지 않는다.

자료가 없으면 기존에 받은 MD 자료집과 전체문서.zip으로 오프라인 prepare-rag.py를 실행해 새 폴더를 만든다. 기존 자료 전체를 외부 AI에 올리지 않는다. 실제 원본 서식이 더 필요하면 업무담당 검토 후 해당 원본과 해시·문서ID를 지식 버전에 추가한다.
