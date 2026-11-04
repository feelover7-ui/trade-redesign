# v0.9 NAS 통합 마이그레이션·복구 계획

2026-11-04: 실제 NAS v0.7.1은 feedback와 원본 보관을 포함한 통합 schema5다. 최신 main v0.9도 다른 schema5에서 import_document_exports를 추가하므로 단순 조기 반환하면 NAS에 변환 파일 테이블이 생성되지 않는다. 통합 배포는 schema6을 사용한다.

기존 schema1~5를 보존하고 없는 feedback/attachment/index와 import_document_exports만 추가한다. NAS는26→27개 테이블이다. 기존 행·원본/첨부 BLOB·불변 트리거를 재생성하거나 삭제하지 않는다. main v0.9 schema5의 변환 파일도 보존하며 schema6 재오픈은 멱등이다.

앱만 중지해 DB+uploads, 별도 rag-usage.sqlite와 읽기 전용 corpus를 일관되게 백업하고 새 경로에 복원해 무결성/참조/전체 행/원본과 첨부 해시를 먼저 검증한다. 새 이미지로 복원본을6으로 열어 기존 모든 행·로그인·기관권한·개선사항·RAG를 검사한 뒤 실제 DB를 전환한다. 변환 XLSX BLOB도 업무 DB 백업에 포함된다.

실패 시 현재 DB·신규 변환 결과를 보존하고 이전 schema5 백업을 새 DATA_DIR에 복원해 이전522526d 코드와 연결한다. 현재 DB에 구버전을 직접 실행하거나 원본/업로드/백업을 지우지 않는다. 기존 키·모델·Cloudflare·HTTPS·포트·네트워크와 다른 서비스는 유지한다. OZD_LEGACY_BRIDGE_FALLBACK는false다. 실제 경로와 검사 결과는 NAS_DEPLOYMENT.md에 기록한다.
