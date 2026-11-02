# Hive의 DeepSeek 4.1 Flash 1017 연결

물품이음의 답변 봇은 기존 DeepSeek 직결과 사용자가 선택한 Hive 연결을 명시적으로 구분한다. 기본값은 여전히 `RAG_PROVIDER=deepseek`, `RAG_MODEL=deepseek-flash`다. 기존 사진 AI 및 Codex/OpenCode의 모델·인증 설정은 변경하지 않는다.

Hive를 선택할 때는 서버 비밀환경에만 다음을 설정한다. 키 원문은 Git·클라이언트·명령 인자·로그에 넣지 않는다.

```dotenv
RAG_PROVIDER=hive
RAG_MODEL=deepseek-ai/deepseek-v4.1-flash-1017
HIVE_API_KEY=
RAG_AI_ENABLED=true
RAG_EXTERNAL_APPROVED=true
# 기관 간 공유 승인이 없으면 계속 false
RAG_LIBRARY_ENABLED=false
```

`HIVE_API_KEY`와 `DEEPSEEK_API_KEY`는 별개다. Hive 모드에서 직결 키를 대신 보내지 않고, 다른 공급자/모델로 자동 대체하지 않는다. 고정 공식 주소 `https://api-cdn.thehive.ai/api/v3/chat/completions`에만 전송하며 `reasoning_effort=none`, JSON 응답, 출력2600토큰·60초·256KB 제한을 사용한다. 반환 모델이 지정한1017 모델과 다르면 답변을 거부한다. 본문·인용ID 검증과 인증·업무역할·CSRF·사용자 동의·일일 기관 한도를 그대로 적용한다. 화면에 Hive 공급자를 표시한다.

공식 Hive 모델 목록 문서에는 고정 모델 ID가 있지만 계정의 `GET /models` API는 확인되지 않았다. 임의 주소나 목록 응답을 만들지 않는다. `npm run rag:check -- --live`는 Hive 모드에서 공개 프로그램 안내로 실제 completion을 호출하고 반환 모델 ID·JSON 인용 답변을 검증한다. DeepSeek 직결은 기존 공식 `/models` 확인을 유지한다.

기관 간 지침 공유와 외부 전송 승인은 별개다. 키를 연결했다고 비공개 지침 검색을 활성화하지 않는다. 개선사항·기관 거래·사진·대장을 RAG에 색인하거나 전송하지 않으며 AI에 원본 대장·확정 수량·행정 승인 변경 권한을 주지 않는다.

교체 전 앱을 중지한 상태에서 기존 DB·uploads를 백업하고 별도 경로에 복원해 검사한다. 호출한도 `DATA_DIR/rag-usage.sqlite`는 기존 백업 스크립트 대상에 포함되지 않으므로 앱 중지 시 별도 복사·SHA-256·SQLite 무결성 및 복원 대조를 수행한다. 비공개 corpus는 이전 버전·원본 ZIP·읽기 전용 연결을 보존한다. 환경을 되돌릴 때 키·설정은 보호된 이전 환경파일을 사용하고 기존 데이터 경로를 덮어쓰지 않는다.

공식 명세: [Hive Chat Completions](https://docs.thehive.ai/docs/chat-completions-openai-compatible-llms), [DeepSeek V4.1 Flash-1017](https://docs.thehive.ai/docs/deepseek-v41-flash). 2026-11-02 확인.
