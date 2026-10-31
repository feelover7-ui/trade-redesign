# 실행·보관·운영 인계

## 환경 변수

| 이름 | 기본 | 설명 |
|---|---|---|
| HOST | 127.0.0.1 | 기본은 해당 컴퓨터에서만 접근 |
| PORT | 4310 | 서버 포트 |
| APP_ORIGIN | http://localhost:4310 | 브라우저 출처와 정확히 일치. 개발 Vite는 localhost:5173 |
| DATA_DIR | ./data | SQLite와 uploads의 영속 경로 |
| DEMO_MODE | false | 합성 계정·물품 생성. 운영환경에서는 금지 |
| SECURE_COOKIE | false | HTTPS 원격 운영에서는 true 필수 |
| NODE_ENV | 개발 기본 | production에서 DEMO_MODE=true 실행 금지 |

`npm start`/setup/backup/preflight은 `.env`를 읽는다. `npm run demo`는 분리된 데모 기본값을 사용하며 `.env`를 읽지 않는다. `NODE_ENV=production`에서 demo 실행은 DB를 열기 전에 거부한다. 단, 셸에 직접 지정한 DATA_DIR 등은 상속하므로 실행 전 확인한다. Node 24.x를 사용한다. 다른 Node 버전에서 node:sqlite 오류가 나면 버전을 먼저 확인한다.

## 포트와 도메인

기존 서비스에 영향을 주지 않도록 4310/5173 충돌을 먼저 확인한다. 브라우저에서 localhost와 127.0.0.1을 섞어 쓰면 Origin 검사로 쓰기 요청이 차단될 수 있다. 화면은 기본 안내 주소 `http://localhost:4310`으로 연다.

도메인 연결 시 승인된 TLS 리버스 프록시를 사용하고 `APP_ORIGIN=https://실제승인도메인`, `SECURE_COOKIE=true`, 서버 바인딩과 프록시 경로를 확인한다. 기관 업무망 차단을 우회하는 자동 설정을 만들지 않는다. API 쓰기 Origin과 쿠키가 정상인지 재검수한다.

## 백업

1. `DATA_DIR` 실제 절대경로와 현재 서비스 PID를 확인한다.
2. 앱을 정상 종료한 뒤 `npm run backup`을 실행한다.
3. `backups/<시각>/trade.sqlite`, `uploads/`, `manifest.json`, 안내파일이 생성되었는지 확인한다.
4. 백업본을 다른 안전한 저장소로 복사하고 해시/복원 시험을 한다. 원본은 삭제하지 않는다.

백업 명령은 원본을 읽기 전용으로 열고 SQLite 무결성·참조·첨부 해시를 검사한다. 없는 경로에 빈 DB를 생성하지 않는다. 백업 사본도 검증한 뒤 DB·첨부 SHA-256 목록을 남긴다. SQLite backup API로 DB 스냅샷을 만들지만 첨부 복사는 별도이므로, 전체 일관성은 서비스 중지 상태에서 확보한다. 보존기간·암호화·반출권한은 운영기관 기준으로 결정한다. 검증표는 우발적 손상 확인용이며 서명·변조 방지 저장소를 대체하지 않는다.

데모를 백업할 때도 대상 경로를 명시한다. macOS/Linux 예:

```sh
DATA_DIR="$PWD/data/demo" npm run backup
```

## 복원

서비스를 중지하고 기존 DATA_DIR은 **그대로 보존**한다.

```sh
npm run restore -- backups/<시각> /절대경로/아직없는새DATA_DIR
```

검증표·파일 목록·해시·SQLite 무결성을 먼저 확인하고, 존재하지 않는 새 경로에만 복원한다. 대상이 이미 있거나 검증이 실패하면 덮어쓰지 않는다. 새 경로의 로그인, 사진, 기관별 접근, 거래 수량과 증빙을 검사한 뒤 `.env`의 DATA_DIR을 바꾼다. 실패하면 이전 경로를 다시 사용한다. 자동 rm/초기화/덮어쓰기로 복원하지 않는다. 검증표 없는 이전 백업은 새 명령이 거부하며 기존 수동 복원 절차로 사본을 먼저 검증한다.

## 승인된 배포 전 검사

`.env`에 승인된 HTTPS APP_ORIGIN, SECURE_COOKIE=true, NODE_ENV=production, 명시적인 절대 DATA_DIR을 설정한 뒤 `npm run preflight`를 실행한다. 읽기 전용 검사이며 배포하거나 DB를 초기화하지 않는다. 시연 계정 포함 DB, 첨부 누락·손상, 미설정 HTTPS 조건은 실패로 보고한다.

코드 검사만으로 호스팅 승인, 실제 HTTPS 종단, 마운트된 영속 볼륨, 기관망 접근, 별도 저장소 백업을 확보했다고 판단하지 않는다. 복원 사본을 실제로 기동하고 로그인·파일 ACL·완료 거래를 확인한 다음 승인된 대상으로만 배포한다. 현재는 승인된 대상이 없으므로 로컬 loopback 시연을 유지한다.

## 이번 macOS 검수 경로

Documents 작업폴더의 파일이 `dataless` 상태가 되어 읽기 시간초과가 발생했다. 원본은 삭제·초기화하지 않고 동기화 폴더 밖의 `~/Developer/trade`에서 검수했다. 시연은 그 사본의 `data/demo`, 자동 검수는 실행별 `data/e2e-*`, 복원은 별도의 `data/restored-*`를 사용한다. 실제 기관 데이터·인증 설정은 이 환경에 없었다. 브라우저 다운로드는 디스크 부족으로 실패했으므로 설치된 Chrome으로 검수했다. 지속 운영 전 여유 공간과 별도 백업 저장소가 필요하다.

## Docker

Dockerfile은 Node 24에서 빌드하고 하나의 서버로 정적 파일과 API를 제공한다. compose의 기본 포트는 호스트 loopback에만 공개한다. 최초 관리자 계정은 `docker compose run --rm app npm run setup`으로 발급한 뒤 `docker compose up -d`한다. 운영체제와 볼륨 권한을 먼저 검증해야 한다. 현재 세션에서는 Docker 실제 실행 검증은 하지 않았으며 Codex 로컬 검수 대상이다.

## 정식 운영 전 필요한 조치

공식 소속 인증, 보안 검토, 악성코드/CDR 검사, 암호화 저장, 개인정보/기록관리 지침, 이미지 마스킹, SSO/MFA, 세션 정책, 백업복원, 담당자 전보, 실제 동시 사용자 부하, 장애 대응, 공급망 패키지 보안 검토를 완료한다. `.env`, DB, 원본 업무문서, 인증 키는 Git에 저장하지 않는다.
