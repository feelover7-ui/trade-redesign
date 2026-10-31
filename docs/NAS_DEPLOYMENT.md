# trade.h19h19.com NAS 배포

사용자가 2026-10-31에 지정한 대상은 **NAS 볼륨2 + Cloudflare + trade.h19h19.com**이다. 기관 운영 승인은 없으므로 합성 자료 시연으로 구성하며 외부 API·AI는 미연결 상태를 유지한다. 이 문서는 배포 구성과 검증 절차이며, 실제 배포 성공 기록은 아래 결과에 별도로 남긴다.

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

## 실제 배포 결과 — 2026-10-31

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
