# trade.h19h19.com NAS 배포

사용자가 2026-10-31에 지정한 대상은 **NAS 볼륨2 + Cloudflare + trade.h19h19.com**이다. 기관 운영 승인은 없으므로 합성 자료 시연으로 구성한다. 외부 API·AI의 실제 연결 상태는 아래 최신 배포 기록을 따른다.

## 데이터와 기존 서비스 보존

NAS 접속 후 먼저 `/volume2`의 실제 마운트, 여유 공간, Docker/Compose 버전, 실행 중 컨테이너·포트, 기존 앱·터널·저장경로를 읽기 전용으로 확인한다. 기존 컨테이너·DNS·터널 설정·DB를 대체하지 않는다. 새 이름의 Compose 프로젝트 `mulppum-ieum`과 확인된 빈 저장경로를 사용한다.

기본 제안 경로는 `/volume2/docker/trade/` 아래 `releases/<commit>/`, `demo-data/`, `backups/`, `secrets/`다. 실제로 사용하기 전 기존 파일 유무와 소유권을 확인한다. 기관용 운영 데이터는 별도 `production-data/`에 두고 시연 DB를 운영 DB로 전환하지 않는다. UID 1000 컨테이너의 쓰기 권한은 새 앱 디렉터리에만 부여한다. 시스템 전체나 다른 앱의 파일 소유권을 재귀 변경하지 않는다.

## 실행 구성

`deploy/nas.compose.yml`은 Node 24 서버, 명시적인 호스트 데이터·백업 영속 경로, HTTPS 출처와 Secure 쿠키, loopback 전용 포트 14310, 헬스체크, 로그 용량 제한을 설정한다. 데이터·백업 폴더가 없으면 자동으로 빈 폴더를 만드는 대신 실패한다.

`deploy/nas.env.example`을 Git 밖의 NAS 전용 `.env.nas`로 복사한다. 시연은 `TRADE_NODE_ENV=development`, `TRADE_DEMO_MODE=true`, 별도 `demo-data`를 사용한다. 이는 합성 시연을 표시하기 위한 명시적 설정이며 production의 데모 차단을 해제하지 않는다. 실제 운영은 `production`/`false`, 별도 운영 DB·계정·기관 승인이 필요하다.

```sh
docker compose --env-file /volume2/docker/trade/.env.nas -f deploy/nas.compose.yml config --quiet
docker compose --env-file /volume2/docker/trade/.env.nas -f deploy/nas.compose.yml up -d --build app
docker compose --env-file /volume2/docker/trade/.env.nas -f deploy/nas.compose.yml ps
curl --fail http://127.0.0.1:14310/api/health
```

NAS 버전에 따라 `docker compose` 또는 검증된 `docker-compose` 명령을 사용한다. 기존 Docker 설치나 다른 스택을 바꾸지 않는다.

이번 NAS는 Docker 기본 주소 풀이 소진되어 있었다. 기존 네트워크·라우팅과 겹치지 않는 `10.253.43.0/28`을 검사한 뒤 `deploy/nas.network.compose.yml`을 추가하여 이 앱 전용 네트워크만 만들었다. 현재 NAS에서 사용하는 명령은 다음과 같다. 상위 폴더 권한을 바꾸지 않고 기존에 허용된 sudo를 사용한다.

```sh
sudo -n /usr/local/bin/docker-compose --env-file /volume2/docker/trade/.env.nas \
  -f /volume2/docker/trade/current/deploy/nas.compose.yml \
  -f /volume2/docker/trade/current/deploy/nas.network.compose.yml ps
```

## Cloudflare 연결

기존 NAS Tunnel이 있다면 설정 사본을 보존한 뒤 **새 hostname 경로 하나만 추가**한다. cloudflared가 NAS 호스트 네트워크에서 실행되면 원본은 `http://127.0.0.1:14310`이다. Docker bridge에서 실행되는 터널은 별도 네트워크 접근을 확인해야 하므로 loopback 주소를 그대로 넣지 않는다.

별도 커넥터가 필요한 경우에만 `deploy/nas.tunnel.compose.yml`을 추가한다. 이 커넥터는 앱과 같은 Compose 네트워크를 사용하므로 원본은 `http://app:4310`이다. 터널 토큰은 NAS의 `secrets/` 파일에만 보관하고 읽기 전용 파일로 마운트한다. 토큰을 Compose 명령 인자·로그·Git에 넣지 않는다. 기존 터널 토큰을 교체하지 않는다.

Cloudflare에서 새 `trade.h19h19.com`이 다른 레코드·Worker·앱과 충돌하지 않는지 다시 확인한 뒤 새 경로만 등록한다. TLS 검증을 끄지 않는다. [Cloudflare 공식 Tunnel 구성](https://developers.cloudflare.com/tunnel/get-started/)을 따른다.

## 배포 후 검증과 복구

HTTPS 인증서·HTTP→HTTPS 전환, 로그인·로그아웃, Secure/HttpOnly/SameSite 쿠키, Origin/CSRF, 저장 실패 안내, 한글 사진·증빙, CSV 다운로드, 기관별 파일 접근을 실제 도메인에서 검사한다. API 응답이 캐시되지 않는지 확인하고 데스크톱/390px 화면을 연다.

앱의 합성 데이터 한 건을 저장한 뒤 앱 컨테이너만 재시작하여 DB·첨부가 남는지 확인한다. 앱을 중지한 상태에서 같은 이미지의 일회성 컨테이너로 `npm run backup`을 실행한다. `/app/backups`는 `TRADE_BACKUP_DIR`에 바인드되어 백업이 컨테이너 삭제 후에도 볼륨2에 남는다. 복원 시험은 새 `restore-checks/` 부모 경로를 별도로 마운트하여 아직 없는 하위 경로로 복원한다. 기존 데이터 마운트 자체를 복원 대상 삼아 덮어쓰지 않는다. 복원 사본의 실제 로그인·파일 접근을 확인한다. 같은 NAS 볼륨의 백업만으로 NAS 장애 복구까지 검증했다고 주장하지 않는다.

문제가 있으면 새 `trade` 경로와 이 Compose 프로젝트만 중지하고 소스 릴리스·환경 경로를 이전 값으로 되돌린다. `down -v`, DB 삭제, `docker system prune`, 기존 서비스 전체 재시작은 사용하지 않는다.

## AI 답변 요청 동의 문구 제거 — 2026-11-02

현재 배포 소스는 `a6de093827130bfb8a5d12f188629c40719f03e5`, 릴리스는 `/volume2/docker/trade/releases/a6de093`, 이미지는 `mulppum-ieum:a6de093`이다(이미지ID `sha256:3dcea824561566d46d806b1aa1ba7d8eb7a7cd99d106fc823bc9dca134862eca`). 사용자 요청으로 챗봇의 전송 동의 문구·체크박스를 제거했다. AI 답변 받기 버튼을 누를 때만 요청별 확인 플래그를 보내고, 근거 검색은 외부 AI를 호출하지 않는다. 서버의 인증·업무역할·CSRF·외부전송 승인·지침 공유·한도 검사는 유지한다.

변경 전 기존 릴리스121개 파일이 배포 원본과 동일함을 확인했다. `/volume2/docker/trade/backups/2026-11-02T03-19-53Z-rag-direct-request-pre-v3`에 앱 중지 상태의 DB·첨부17개·계정7개와 호출한도DB를 백업하고 `/volume2/docker/trade/restore-checks/2026-11-02T03-19-53Z-rag-direct-request-pre-v3`에 별도 복원했다. 호출한도1행·3회와 해시/무결성을 대조하고 비공개 시험 서버에서 기존 물품·사진·상태배분·배송·개선사항/답변·파일 ACL을 확인했다. DB버전3·데이터 경로·키·모델·Cloudflare·HTTPS·포트·Docker 네트워크와 다른 컨테이너ID를 보존했으며 환경파일은 `TRADE_RELEASE`만 변경했다.

서버83개·빌드·Chrome E2E14개를 통과했다. 추가 UI 검사는 공급자 테스트 더블로 검색과 명시적 AI 요청을 구분하고 오류에도 근거가 유지되는지 확인한다. 실제 공개 도메인의1440px/390px에서 문구·체크박스 부재와 질문 입력만으로 버튼 활성화를 확인하고, 체크박스 없이 요청한 결과 실제 `deepseek-ai/deepseek-v4.1-flash-1017` 답변을 받았다. 캡처도 직접 열어 확인했다. 검증 기록은 `/volume2/docker/trade/deployments/rag-direct-request-2026-11-02T03-19-53Z`에 비공개로 보존했다.

## 이전 v0.5.2 Hive DeepSeek 1017 연결 결과 — 2026-11-02

현재 [AI 업무도우미](https://trade.h19h19.com/#/assistant)는 사용자가 지정한 기존 OpenCode의 Hive 키로 실제 DeepSeek4.1 1017 답변을 제공한다. 키는 값 출력 없이 SSH stdin으로 서버에 전달하여 root 전용 환경파일에 저장했다. 원래 OpenCode/Codex의 모델·인증과 사진 AI 설정은 변경하지 않았다.

| 항목 | 실제 구성 |
|---|---|
| 배포 소스 / 릴리스 | `919a706e14869c0ecfce9eee9dc45f160a0b52d7` / `/volume2/docker/trade/releases/919a706` (`current`) |
| 앱 / 이미지 | `mulppum-ieum-app-1` / `mulppum-ieum:919a706` |
| 이미지 ID | `sha256:933743db764b43c440ae5a65ee78481210dd71aadef7aaedba44547dcdfbaebc` |
| 실제 공급자 / 반환 모델 | Hive / `deepseek-ai/deepseek-v4.1-flash-1017` |
| 서버 비밀환경 | `/volume2/docker/trade/.env.nas` (root/0600), `RAG_PROVIDER=hive`, `HIVE_API_KEY` 사용 |
| DB / 첨부 / 호출 한도 | 기존 `/volume2/docker/trade/demo-data/trade.sqlite`, `uploads/`, 별도 `rag-usage.sqlite` |
| 공개 검색 / 비공개 자료 | 프로그램 안내9개·지침0개 / 121문서·8,164구간과129개 파일은 이전 버전 경로/읽기 전용 유지 |
| 검증 기록 | `/volume2/docker/trade/deployments/hive-2026-11-02T02-51-56Z` (root 전용) |

이전과 같은 세 Compose 파일을 사용하며 `nas.rag.compose.yml`에 공급자·Hive 키 환경변수만 추가했다. 호스트 loopback14310, HTTPS/Secure 쿠키, Cloudflare 설정/커넥터·Docker 네트워크ID와 다른 기존 컨테이너ID를 유지했다. 환경파일 변경 항목은 `TRADE_RELEASE`, `RAG_PROVIDER`, `RAG_MODEL`, `RAG_AI_ENABLED`, `HIVE_API_KEY` 다섯 가지다. 비공개 지침 공유는 계속 false다.

### 백업·복원·검수

| 단계 | 백업 / 새 복원 경로 |
|---|---|
| 교체 전 검수 | `/volume2/docker/trade/backups/2026-11-02T02-55-34Z-hive-pre-v3` / `/volume2/docker/trade/restore-checks/2026-11-02T02-55-34Z-hive-pre-v3` |
| 최종 교체 직전 | `/volume2/docker/trade/backups/2026-11-02T03-05-21Z-hive-final-cutover-v3` / `/volume2/docker/trade/restore-checks/2026-11-02T03-05-21Z-hive-final-cutover-v3` |
| 실제 답변 후 | `/volume2/docker/trade/backups/2026-11-02T03-11-34Z-hive-post-v3` / `/volume2/docker/trade/restore-checks/2026-11-02T03-11-34Z-hive-post-v3` |

앱만 중지한 일관된 DB·uploads 백업과 SHA-256·SQLite 무결성 검사를 수행했다. DB버전3을 유지하며 최종 교체 전후 기존21개 테이블 전체 행 해시가 같았다. 교체 후 첨부17개·계정7개와 기존 물품·사진·상태배분·배송 예상·개선사항/답변/파일 ACL을 별도 `--network none` 시험 서버에서 복원 검수했다. 시험 컨테이너만 제거하고 사본은 보존했다.

실제 UI 생성으로 만든 `rag-usage.sqlite`는 기본 backup/restore 스크립트 대상이 아니므로 앱 중지 중 SQLite backup으로 별도 저장했다. 위 post 백업의 `rag-usage.sqlite`와 `rag-usage-manifest.json`을 새 복원 경로에도 연결해 무결성·파일 해시·행을 대조했다(기관/일자1행, 호출3회). **복구할 때 기본 restore만 실행한 뒤 끝내지 말고, 같은 시점의 사용량DB도 별도로 무결성·해시 검증 후 새 경로에 복사한다.** 대화본문은 이 DB에 저장하지 않는다.

macOS/NAS 서버83개·빌드, Chrome13개, `rag:check -- --live`, 공개 안내20개 실제 답변/출처 대조와1440px/390px 직접 조작을 확인했다. 초기 답변의 예약 설명을 보완하고 재검수했으며, 공급자 형식 오류1건은 성공 처리하지 않고 거부한 후 수동 재요청했다. 상세 결과와 한계는 [RAG_TEST_REPORT.md](RAG_TEST_REPORT.md)를 따른다.

초기 교체 확인의 고정 health 버전 문제로 이전 소스/환경에 자동 복귀한 기록과 백업도 보존했다. 최종 health는0.5.2다. 이 변경에는 DB 마이그레이션이 없으므로 같은 v3 DB를 유지한 채 보호된 이전 환경파일과 `8c71c76` 소스로 복귀할 수 있다. 복귀 전에는 신규 DB·첨부·호출한도를 별도로 백업한다. corpus와 기존 데이터를 덮어쓰지 않는다. 기관 정식 운영·지침 공유·별도 저장소 재해복구 승인은 포함하지 않는다.

## 이전 v0.5.1 개선사항 보존 업데이트 결과 — 2026-11-02

당시 [https://trade.h19h19.com](https://trade.h19h19.com)에 v0.5.1을 반영했다. [개선사항](https://trade.h19h19.com/#/feedback) 메뉴에서 의견과 사진·파일을 접수하며 모바일은 `더보기 → 개선사항`으로 접근한다. 작성자와 운영관리자만 조회하고 관리자가 처리 상태·답변을 기록한다. 첨부는 최대5개·각8MB이며 기존 업무 파일 권한은 확대하지 않았다.

| 항목 | 실제 구성 |
|---|---|
| 배포 소스 | `8c71c76dcb5c0585b3ee42e0209c6c254fe23dad` (`codex/feedback-tab`) |
| 현재 릴리스 | `/volume2/docker/trade/releases/8c71c76dcb5c0585b3ee42e0209c6c254fe23dad` (`current` 링크) |
| 앱 / 이미지 | `mulppum-ieum-app-1` / `mulppum-ieum:8c71c76` |
| 이미지 ID | `sha256:a09672e80d8bfe36b838fa4ee2f7941845242bb86fd7a86b1dcedeb7e7744cde` |
| DB / 첨부 | `/volume2/docker/trade/demo-data/trade.sqlite` / 같은 경로 `uploads/` (기존 경로 유지) |
| DB 버전 | `user_version=3` (v2에 개선사항 테이블2개만 추가) |
| 포트 / 네트워크 | `127.0.0.1:14310 → 4310`, 기존 `mulppum-ieum_default`·`10.253.43.0/28` 유지 |
| 지침 연결 | 이전 v0.5 버전 경로와 `/app/rag-private` 읽기 전용 연결 유지, 129개 파일 동일 |
| 서비스 검색 / AI | 프로그램 안내9개·지침0개 / DeepSeek·사진 AI 기존 설정 유지 |
| 검증 기록 | `/volume2/docker/trade/deployments/feedback-2026-11-02T01-17-44Z/` |

기존 DB·계정·미커밋 변경·포트·서비스를 먼저 확인한 뒤 Git archive 소스만 빌드했다. 자료팩·검색DB·개선사항·첨부·키는 이미지나 공개 저장소에 포함하지 않았다. 다른 컨테이너65개의 ID, 기존 Docker network ID, Cloudflare 라우팅 SHA-256과 터널 커넥터를 유지했고 `.env.nas`는 `TRADE_RELEASE`만 변경했다. HTTPS·Secure 쿠키와 loopback 포트·데이터 경로도 유지한다.

### 일관된 백업·마이그레이션·복원

각 백업은 앱만 중지한 상태에서 DB+uploads를 함께 저장하고 무결성·파일 해시를 검사했다. 아래 경로와 원본을 모두 보존했다.

| 단계 | 백업 / 별도 복원 경로 |
|---|---|
| 교체 전 v2 | `/volume2/docker/trade/backups/2026-11-02T01-17-44Z-feedback-v2` / `/volume2/docker/trade/restore-checks/2026-11-02T01-17-44Z-feedback-v2` |
| 별도 v3 마이그레이션 | 위 백업 → `/volume2/docker/trade/restore-checks/2026-11-02T01-17-44Z-feedback-v2-migrated-v3` |
| 실제 교체 직전 v2 | `/volume2/docker/trade/backups/2026-11-02T01-30-59Z-feedback-cutover-v2` / `/volume2/docker/trade/restore-checks/2026-11-02T01-30-59Z-feedback-cutover-v2` |
| 교체 후 v3 | `/volume2/docker/trade/backups/2026-11-02T01-37-58Z-feedback-post-v3` / `/volume2/docker/trade/restore-checks/2026-11-02T01-37-58Z-feedback-post-v3` |

구버전 복원 사본에서 로그인·기존 자료·사진·80개 상태배분·배송 예상 기록을 검사했다. 별도 사본 및 실제 DB의 v2→v3 전후 **기존19개 테이블 전체 행 해시가 일치**했고 재오픈은 멱등이었다. 계정7개·기존 첨부15개를 보존했다. 교체 후 **첨부17개**를 포함한 v3 백업을 새 경로에 복원하여 기존 자료와 신규 의견의 처리완료 상태·관리자 답변·첨부2개·작성자 접근·타기관 차단을 확인했다. 실제 앱 재시작 후 같은 신규 의견과 원본 자료를 확인했다. 시험 컨테이너만 제거하고 모든 백업·복원 사본은 유지했다.

**v3 원본에 v0.5 구버전을 직접 실행하지 않는다.** 먼저 앱만 중지하고 v3 DB·uploads·새 의견을 별도 보존한다. 위 검증된 v2 백업을 **새 DATA_DIR**로 복원한 뒤 이전 `d6bd5c9` 릴리스/이미지와 환경을 사용한다. 신규 v3 의견은 v2 백업에 없으므로 별도 대조·보존이 필요하다. 기존 원본을 덮어쓰거나 DB 버전 숫자만 내리는 복구는 사용하지 않는다.

### 실제 화면·권한 검사

Node24/macOS·NAS Linux Docker에서 서버80개·빌드, 최종 Chrome E2E13개를 통과했고 알려진 npm 취약점은0건이었다. 실제 도메인의 1440px/390px 화면에서 의견·사진·TXT 접수와 다운로드, 관리자 상태·답변, 작성자의 결과 조회를 직접 확인했다. 동일기관 다른 사용자와 타기관은 의견·첨부를 읽을 수 없고 기존 업무 파일 ACL도 유지했다. 한글 파일명·이미지 EXIF 제거·미인증401·CSRF403·no-store를 확인했다. 상세 결과는 [FEEDBACK.md](FEEDBACK.md)에 기록했다.

기관 운영 승인 전 **합성 시연** 상태다. 지침 공유 미확인·DeepSeek 키 미제공에 따른 비활성 설정을 유지했으며 기존 사진 AI·Codex 모델/인증은 변경하지 않았다. 같은 NAS 안의 백업·복원을 검증했으며 NAS 전체 장애용 별도 저장소 백업은 여전히 후속 설정이다.

## 이전 v0.5 RAG 보존 업데이트 결과 — 2026-11-01

당시 [https://trade.h19h19.com](https://trade.h19h19.com)에 반영한 v0.5.0의 실제 배포 소스는 `d6bd5c9faef0d19bdee8db582da87df1750400a8`입니다. 앱 코드를 수정하지 않고 지정된 main 커밋 그대로 NAS에서 빌드·반영했습니다. 이전 v0.4 검수 문서가 main에 합쳐지지 않았으므로 이 문서에 해당 이력도 보존했습니다.

| 항목 | 실제 구성 |
|---|---|
| 현재 릴리스 | `/volume2/docker/trade/releases/d6bd5c9faef0d19bdee8db582da87df1750400a8` (`current` 링크) |
| 앱 / 이미지 | `mulppum-ieum-app-1` / `mulppum-ieum:d6bd5c9` |
| 이미지 ID | `sha256:8f01948e814183810324dec01dc833ab9f9c9bf2d08d9ddefaa82637f4af624f` |
| DB / 첨부 | `/volume2/docker/trade/demo-data/trade.sqlite` / 같은 경로 `uploads/`, 기존 경로·계정 유지 |
| 지침 버전 경로 | `/volume2/docker/trade/knowledge/v0.5-20261101-9d7f2b4ffcd7/trade-rag-private-v05` |
| 컨테이너 지침 | `/app/rag-private`, **읽기 전용**, UID1000 읽기 확인 |
| 자료팩 보존본 | `/volume2/docker/trade/knowledge-packages/trade-rag-private-v05-9d7f2b4ffcd7.zip` (비공개) |
| 인덱스 SHA-256 | `bd1a85c1f3ddfd398387b537291a8497e2ef05a2345483c28337504a7dbd4a11` |
| 자료팩 ZIP SHA-256 | `9d7f2b4ffcd7289ca32260e3e5427585aed324d6db310533f6ff8e3cbcf3116a` |
| 설치 / 서비스 공개 수 | 비공개121문서·8,164구간 / 서비스는 **프로그램8개·지침0개** |
| RAG 모델 | 설정 별칭 `deepseek-flash`, 실제 계정 모델/반환ID는 **키 미제공으로 미확인** |
| 검증 기록 | `/volume2/docker/trade/deployments/v05-2026-11-01T07-33-37Z/` |

로컬은 미커밋 변경이 없는 `~/Developer/trade`에서 새 `codex/v05-nas-rag` 브랜치를 사용했습니다. 이전 문서 브랜치와 실제 v0.4 릴리스는 보존했고 NAS 이전 릴리스의 추적 파일 해시가 기준 커밋과 같은지 먼저 확인했습니다. 사용자가 명시한 영문 다운로드 파일 두 개가 전달한 자료팩·인계서임을 확인해 사용했습니다. 첨부의 실행 지시는 점검 참고이며 기관 공유/반출 승인 자체로 해석하지 않았습니다.

자료팩은 ZIP 경로/심볼릭 링크·CRC를 검사하고 저장소 및 Docker 빌드 문맥 밖에 새 버전으로 해제했습니다. NAS 상위 공유 경로 권한은 변경하지 않았고 새 자료 하위 경로만 UID1000·디렉터리0500/파일0400으로 설정했습니다. 기존 Compose 두 파일에 `deploy/nas.rag.compose.yml`만 추가해 read-only bind를 연결했습니다. 이미지 빌드는 Git archive만 사용했으며 런타임 이미지에 자료팩·index·MD·원본 경로가 없는 것을 확인했습니다.

### 승인·키 상태

사용자는 공개 프로그램 안내/질문 및 지침의 DeepSeek 전송을 허용했고 키는 나중에 제공하기로 했습니다. 기관 간 지침 공유는 아직 미확인입니다. 따라서 실제 `.env.nas`의 RAG 설정은 다음과 같습니다. 키 원문은 Git·클라이언트·이 문서에 없습니다.

```dotenv
RAG_MODEL=deepseek-flash
RAG_AI_ENABLED=false
RAG_EXTERNAL_APPROVED=true
RAG_LIBRARY_ENABLED=false
RAG_LIBRARY_EXTERNAL_APPROVED=true
RAG_DAILY_LIMIT=50
```

`TRADE_RAG_CORPUS_DIR`에는 위 NAS 버전 경로를 지정했습니다. `DEEPSEEK_API_KEY`는 현재 없으며 기본 빈 값으로 컨테이너에 전달됩니다. Codex 자체 모델·인증 및 기존 사진 AI 설정은 바꾸지 않았습니다. 공식 [모델 목록 문서](https://api-docs.deepseek.com/api/list-models/)에서 `deepseek-flash`/DeepSeek-V4.1-Flash 별칭을 확인했으나 계정 접근과 실제 응답 모델을 검증한 것은 아닙니다. `--live` 및 실제 DeepSeek20개 답변 검수는 키 제공 후 수행해야 합니다. 다른 모델로 자동 대체하지 않았습니다.

서비스에서는 지침 검색 결과·직접 구절·원본 다운로드를 차단합니다. 검사 프로세스에서만 지침 활성화를 켜고 외부 포트 없는 `--network none` 컨테이너에서 원문 검색·후속 질문·원본 바이트 해시를 검수했습니다. 실제 앱 안에서 실행한 `rag:check`도 별도 검사 프로세스의 환경만 바꾸었으며 실행 중인 HTTP 서비스의 공유 설정을 바꾸지 않았습니다.

### 백업·복원과 기존 서비스 보존

| 단계 | 백업 / 별도 복원 경로 |
|---|---|
| 사전 업무DB | `backups/2026-11-01T07-34-44Z-v05-pre` / `restore-checks/2026-11-01T07-34-44Z-v05-pre` |
| 별도 RAG 백업 | `rag-backups/2026-11-01T07-34-44Z-v05-pre` (자료 ZIP·호출한도 DB 유무 기록) |
| 자료팩 복원 | `restore-checks/2026-11-01T07-34-44Z-v05-pre-corpus/trade-rag-private-v05` |
| 교체 직전 업무DB | `backups/2026-11-01T07-39-40Z-v05-cutover` / 같은 이름의 `restore-checks/` 새 경로 |
| 업데이트 후 업무DB | `backups/2026-11-01T07-43-25Z-v05-post` / 같은 이름의 `restore-checks/` 새 경로 |

위 상대 경로의 부모는 모두 `/volume2/docker/trade/`입니다. 각 업무DB 백업은 앱만 중지한 상태에서 SQLite 무결성·참조·첨부15개 SHA-256을 확인하고 새 경로로 복원했습니다. 구버전 복원 서버에서 기존 로그인·초안·사진·상태배분·배송 기록을 확인한 뒤 새 이미지를 빌드했습니다. 새 버전의 복원 사본과 실제 DB 재오픈 모두 **기존19개 테이블 전체 행 해시 동일, user_version=2 유지**를 확인했습니다. RAG는 업무DB 마이그레이션을 추가하지 않습니다.

자료팩은 별도로 ZIP을 보존·해시 검증하고 독립 복원 폴더의129개 파일을 전부 원본 해시와 대조했습니다. 실제 이미지와 실제 마운트에서 `rag:check`의121문서/8,164구간·manifest 일치를 확인했습니다. 모든 구간의 MD 출처 위치도 변환 규칙으로 재현해 검증했습니다. `rag-usage.sqlite`는 키·호출이 없어 사전/사후 모두 **존재하지 않음**을 별도 기록했습니다. 대화나 가짜 호출한도 DB를 만들지 않았습니다.

향후 AI를 활성화하면 기본 업무DB 백업만으로 호출한도 DB까지 보존했다고 판단하지 마세요. 앱을 중지하고 `DATA_DIR/rag-usage.sqlite`를 SQLite backup API로 별도 백업해 무결성·SHA-256을 기록하고, 새 복원 DATA_DIR의 같은 파일에 복원·검증해야 합니다. 지침은 같은 버전의 ZIP/manifest/전체 파일을 별도 보존하세요. 현재 백업은 같은 NAS 볼륨의 검증이며 별도 저장소 장애복구는 남아 있습니다.

업데이트 후 복원 서버에서 기존 계정·물품·첨부·배송 기록과 지침 미공유 상태를 확인했습니다. 시험 컨테이너만 제거하고 모든 백업·복원 사본·구버전 릴리스를 보존했습니다. 다른 앱 컨테이너ID, Docker network ID/subnet, Cloudflare 라우팅 해시, HTTPS 출처·Secure 쿠키·`127.0.0.1:14310`을 유지했고 터널도 재시작하지 않았습니다.

문제가 생기면 앱만 중지하고 현행 데이터·RAG 사용량을 먼저 보존하세요. v0.4 복귀는 보존된 `9712affa...` 릴리스/이미지와 환경 설정을 사용하며 지침·RAG 백업은 삭제하지 않습니다. v0.5는 스키마2를 유지하므로 원본 DB를 초기화할 이유가 없습니다. 데이터 복원이 필요하면 검증한 백업을 **새 DATA_DIR**에 복원해 로그인·파일을 확인한 후 경로를 전환하세요.

### 검사 결과와 남은 검수

Node24/macOS 및 NAS Docker에서 서버73개·빌드, Chrome E2E11개, 알려진 npm 취약점0건을 확인했습니다. 실제 HTTPS에서 질문→프로그램 근거→출처 펼침→후속 질문→기능 이동을 1440px/390px로 조작하고 캡처를 열어 확인했습니다. 비로그인401·관리자403·CSRF403, 공유 미승인 원본/구절404, 키 없는 생성 요청의 검색 전용 상태를 확인했습니다. 오프라인20개 질의 검색은 수행했지만 실제 모델 생성은0회입니다. 상세는 [RAG_TEST_REPORT.md](RAG_TEST_REPORT.md)를 따릅니다.

## 이전 v0.4 보존 업데이트 결과 — 2026-11-01

**현재 서비스는 [https://trade.h19h19.com](https://trade.h19h19.com)의 v0.4.0 합성 시연**입니다. 최신 main 기준 `9712affa22991a4b021fccdb8e913b66d145a4f3`을 Git archive로 전달해 NAS에서 빌드했습니다. 앱 코드 변경 없이 해당 커밋 그대로 배포했으며 아래 v0.3 기록은 이전 이력입니다.

| 항목 | 실제 확인값 |
|---|---|
| 소스 / 현재 릴리스 | `9712affa22991a4b021fccdb8e913b66d145a4f3` / `/volume2/docker/trade/releases/9712affa22991a4b021fccdb8e913b66d145a4f3` |
| 현재 링크 | `/volume2/docker/trade/current` → 위 릴리스 |
| 컨테이너 / 이미지 | `mulppum-ieum-app-1` / `mulppum-ieum:9712aff` |
| 이미지 ID | `sha256:eb2e7d0b6237b70ea5db78889b8b90aa3edbdb274e3f22be016a47cc5f2f9094` |
| DB / 업로드 | `/volume2/docker/trade/demo-data/trade.sqlite` / `/volume2/docker/trade/demo-data/uploads/` (동일 경로 유지) |
| 런타임 | Node 24.22.2, `DEMO_MODE=true`, `NODE_ENV=development`, DB `user_version=2` |
| 기존 연결 | `127.0.0.1:14310`, `10.253.43.0/28`, 기존 Docker network ID, HTTPS 출처·Secure 쿠키·Tunnel/DNS 유지 |
| 최초 검증 백업 | `/volume2/docker/trade/backups/2026-11-01T06-38-04Z-v04-v1` |
| 교체 직전 v1 백업 | `/volume2/docker/trade/backups/2026-11-01T06-41-33Z-cutover-v1` |
| 업데이트·검수 후 v2 백업 | `/volume2/docker/trade/backups/2026-11-01T06-49-41Z-v04-post` |
| 배포 검증 기록 | `/volume2/docker/trade/deployments/v04-2026-11-01T06-38-04Z/` (비공개 NAS 경로) |

로컬 작업 사본 `~/Developer/trade`에는 미커밋 변경이 없었습니다. 기존 NAS 릴리스의 모든 추적 파일 SHA-256을 이전 커밋과 비교해 현장 수정이 없음을 확인했습니다. 데이터 경로·마운트와 DB 버전을 먼저 확인했고 기존 DB를 새로 만들거나 계정·첨부를 초기화하지 않았습니다. `.env.nas`는 NAS 내부에 원본을 보존한 뒤 `TRADE_RELEASE`만 변경했습니다. 다른 앱 컨테이너 ID, 기존 Docker network ID 및 Cloudflare 라우팅 설정의 SHA-256은 유지됐고 Tunnel 커넥터도 재시작하지 않았습니다.

### 백업·마이그레이션·복원

앱만 중지하고 v1 DB+uploads를 백업했습니다. SQLite 무결성/참조, 첨부 14개 SHA-256을 검사하고 `/volume2/docker/trade/restore-checks/2026-11-01T06-38-04Z-v04-v1`에 복원했습니다. 구버전의 별도 비공개 시험 컨테이너에서 기존 로그인·초안·사진·타기관 접근 차단을 확인한 뒤 기존 앱을 재가동했습니다.

같은 백업을 새 `2026-11-01T06-38-04Z-v04-v1-migrated-v2` 경로에 다시 복원하여 v2로 마이그레이션했습니다. 기존 **13개 테이블 전체 행의 정렬된 JSON 해시**가 전후 동일했고 재오픈도 멱등이었습니다. 기관 3개·계정 7개·물품 7개·자산 6개·첨부 14개를 포함한 기존 자료와 로그인·파일 ACL을 확인했습니다. NAS 이미지 빌드·59개 서버 테스트 후 교체 직전 v1 백업과 별도 `2026-11-01T06-41-33Z-cutover-v1` 복원 사본을 추가했습니다. 실제 DB 마이그레이션에서도 같은 전체 행 보존 검사를 통과한 후 앱 컨테이너만 교체했습니다.

공개 사이트 검수 후 앱을 다시 중지해 v2 백업을 만들고 `/volume2/docker/trade/restore-checks/2026-11-01T06-49-41Z-v04-post`에 복원했습니다. 별도 비공개 v0.4 서버에서 기존·신규 초안과 첨부 **15개**, 한글 사진 품명·명판 용도, 50/20/10 상태 배분, 저장한 배송 예상 기록을 확인했습니다. 실제 앱도 재기동 후 같은 검사를 통과했습니다. 시험 컨테이너만 제거하고 모든 백업·복원 디렉터리는 보존했습니다.

**롤백 시 v2 원본에 v0.3을 바로 실행하지 마세요.** 먼저 앱만 중지하고 v2 DB·uploads를 별도로 백업합니다. 새 경로에 검증한 v1 백업을 복원한 뒤 `TRADE_DATA_DIR`을 그 사본으로, `TRADE_RELEASE`와 `current`를 보존된 `174431a` 릴리스로 바꾸고 동일 Compose 프로젝트의 앱만 실행하세요. 교체 후 신규 v2 자료는 v1 백업에 없으므로 별도로 보존·대조해야 합니다. 기존 원본을 덮어쓰거나 볼륨을 지우는 복구는 사용하지 않습니다.

### 실제 도메인 검수와 남은 설정

macOS/Node 24와 NAS Linux Docker에서 서버 **59개**, TypeScript/Vite 빌드, Chrome E2E **9개**를 통과했습니다(E2E는 로컬 4311의 별도 DB). 알려진 npm 취약점은 0건입니다. 실제 HTTPS 로그인·쿠키·HTTP→HTTPS 308·CSRF 거부·파일 ACL·한글 첨부·UTF-8 BOM CSV와 기존 자료의 영속성을 확인했습니다. 1440px/390px 화면을 직접 조작하고 생성 캡처를 이미지 뷰어로 열어 확인했습니다. 상세 검수는 [V04_TEST_REPORT.md](V04_TEST_REPORT.md)를 따릅니다.

**비식별 실제 에듀파인 파일과 공급자 승인 자료는 제공되지 않았습니다.** 다단 머리글·수동 매핑·합계·80개 등록·재등록·충돌 롤백은 합성 XLSX/XLS로 검수했으며 실제 학교 양식 검수 완료로 표시하지 않습니다. 조달청/참고사진·AI 모델/키·주소/경로는 모두 false/빈 값이고 실제 외부 호출 성공은 없습니다. K-에듀파인·온비드 공식 연결도 미연결입니다. 기본 운송 단가는 `sample-2026-11-v1`의 시연용 가정이며 업체 확정 견적·예약·배차·결제가 아닙니다.

`npm run preflight`는 HTTPS·Secure 쿠키·저장소 무결성은 통과하고, 현재 합성 시연 설정의 `NODE_ENV`, 데모 모드, 시연 계정 분리 조건은 **미충족(종료 1)** 으로 보고했습니다. 이를 우회하지 않았으며 기관 정식 운영 준비 완료를 주장하지 않습니다. 백업은 동일 NAS 볼륨 내부에서 검증했으며 별도 저장소 재해복구는 남아 있습니다.

## 이전 v0.3 실제 배포 결과 — 2026-10-31

**[https://trade.h19h19.com](https://trade.h19h19.com)** 에 NAS 합성 시연 배포를 완료했다. 로컬 Mac에서 서버를 실행하지 않아도 NAS의 Docker 앱과 기존 NAS Cloudflare Tunnel로 응답한다. 사용자가 알려준 「포켓몬」 채팅의 기존 NAS 접속 설정을 찾아 사용했으며 인증 키·터널 비밀 자료는 복사하거나 Git에 넣지 않았다.

| 항목 | 실제 구성 |
|---|---|
| 앱 소스 | `174431a7fedc0efb53c5d3d9e0e108e27eeb5099` |
| 컨테이너 / 이미지 | `mulppum-ieum-app-1` / `mulppum-ieum:174431a` |
| 이미지 ID | `sha256:8c6b595bd5ba3e5aa001a6520954f8d7ff6597a5873f0e717ce93a21f1ef04e3` |
| 실행 환경 | NAS Linux amd64, Docker 24.0.2, Compose 2.20.1, Node 24.22.2 |
| 소스 / 현재 릴리스 | `/volume2/docker/trade/releases/174431a` / `/volume2/docker/trade/current` |
| DB·업로드 | `/volume2/docker/trade/demo-data/trade.sqlite`, 같은 경로의 `uploads/` |
| 백업 | `/volume2/docker/trade/backups/2026-10-31T06-05-17.229Z` |
| 검증한 복원 사본 | `/volume2/docker/trade/restore-checks/2026-10-31T06-05-17.229Z` |
| 접근 / 재시작 | 호스트 `127.0.0.1:14310`만 공개, restart=`unless-stopped`, health=`healthy` |
| 외부 접근 | Cloudflare 프록시 DNS → 기존 NAS Tunnel → `http://127.0.0.1:14310` |

NAS 컨테이너에서 `npm ci`·빌드·서버 **40개 테스트**를 통과했다. 실제 도메인의 HTTPS 인증서, HTTP→HTTPS **308** 전환, Secure/HttpOnly/SameSite 쿠키, 로그인, CSRF 거부, 비공개 초안·파일의 기관 격리, 한글 사진·증빙 업로드/다운로드, UTF-8 BOM CSV를 확인했다. API는 `no-store`를 유지한다. 데스크톱 1440×1000과 모바일 390×844 화면을 실제로 열어 확인했으며 모바일 페이지 가로 넘침이 없다.

공개 도메인에서 만든 합성 초안과 첨부가 이미지 교체·컨테이너 재시작 뒤에도 남는 것을 확인했다. 앱만 중지한 상태에서 **첨부 14개**를 포함한 일관된 백업을 생성하고 즉시 앱을 재기동했다. 백업을 새 경로에 복원해 별도 비공개 시험 컨테이너에서 로그인·원본 초안·사진·타 기관 파일 차단을 검증했다. 시험 컨테이너만 제거했으며 DB·첨부·백업·복원 사본은 모두 보존했다.

기존 터널 설정은 `/volume2/docker/trade/deployments/cloudflared-routing-before.yml`에 보존한 뒤 새 hostname 규칙 한 개만 추가했다. 기존 세 규칙은 바이트 단위로 유지했다. 터널 커넥터만 재시작해 적용했고 기존 세 도메인의 응답은 이전과 동일했다. 다른 앱 컨테이너의 ID는 모두 유지됐다. 기존 터널 토큰이나 자격증명은 변경하지 않았다.

이 배포는 **합성 시연용**이다. 기관 운영 승인·외부 API/AI·실제 기관 자료 반입은 포함하지 않는다. 백업복원은 같은 NAS 볼륨 안에서 확인했으며 NAS 전체 장애를 대비한 별도 저장소 백업은 후속 운영 설정이다. Cloudflare가 삽입하려는 통계 스크립트는 기존 CSP가 차단하며, 이를 허용하려고 보안 정책을 완화하지 않았다.
