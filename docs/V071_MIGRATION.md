# v0.7.1 NAS 보존 마이그레이션 계획

2026-11-04: 기존 NAS 통합 v0.6은 feedback와 catalog를 포함하는 schema4이며, 최신 main의 v0.7/0.7.1도 다른 schema4(import_documents 추가)를 사용한다. main의 `version===4` 조기 반환을 그대로 실행하면 NAS에 원본 보관 테이블이 생성되지 않는다.

이번 통합은 schema5를 사용한다. 기존 schema1/2, feedback/catalog schema3, NAS 통합 schema4, main v0.7 schema4를 모두 지원하며 없는 테이블/인덱스만 추가한다. 원본 행·파일·트리거를 다시 만들거나 삭제하지 않는다. schema5는 재오픈 시 변경하지 않고 더 높은 버전은 거부한다.

배포 전 앱만 중지하고 업무DB+uploads, rag-usage.sqlite, 읽기 전용 RAG 자료의 별도 백업을 생성한다. 백업을 새 경로에 복원해 schema5로 열고 기존 모든 테이블의 전체 행 해시·원본 트리거·무결성/첨부/원본 BLOB 해시·HTTP 로그인/권한을 대조한 후 실제 DB를 전환한다. 현재 NAS는25→26개 업무 테이블이 된다. 원본 업로드 BLOB도 업무 SQLite 백업에 포함된다.

롤백은 현행 schema5 데이터를 먼저 새 백업에 보존하고 교체 전 schema4 백업을 존재하지 않는 새 DATA_DIR로 복원해 이전9d89cce 이미지와 연결한다. 현재 DB를 삭제·덮어쓰지 않으며 구버전 이미지를 schema5 원본에 직접 연결하지 않는다. 교체 이후 신규 자료는 별도 보존·대조한다. corpus·사용량도 보존하고 기존 Cloudflare·네트워크·포트·다른 서비스는 변경하지 않는다. 동일 NAS 복원과 별도 저장소 재해복구는 구분한다.
