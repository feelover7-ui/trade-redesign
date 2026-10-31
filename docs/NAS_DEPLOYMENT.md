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

## Cloudflare 연결

기존 NAS Tunnel이 있다면 설정 사본을 보존한 뒤 **새 hostname 경로 하나만 추가**한다. cloudflared가 NAS 호스트 네트워크에서 실행되면 원본은 `http://127.0.0.1:14310`이다. Docker bridge에서 실행되는 터널은 별도 네트워크 접근을 확인해야 하므로 loopback 주소를 그대로 넣지 않는다.

별도 커넥터가 필요한 경우에만 `deploy/nas.tunnel.compose.yml`을 추가한다. 이 커넥터는 앱과 같은 Compose 네트워크를 사용하므로 원본은 `http://app:4310`이다. 터널 토큰은 NAS의 `secrets/` 파일에만 보관하고 읽기 전용 파일로 마운트한다. 토큰을 Compose 명령 인자·로그·Git에 넣지 않는다. 기존 터널 토큰을 교체하지 않는다.

Cloudflare에서 새 `trade.h19h19.com`이 다른 레코드·Worker·앱과 충돌하지 않는지 다시 확인한 뒤 새 경로만 등록한다. TLS 검증을 끄지 않는다. [Cloudflare 공식 Tunnel 구성](https://developers.cloudflare.com/tunnel/get-started/)을 따른다.

## 배포 후 검증과 복구

HTTPS 인증서·HTTP→HTTPS 전환, 로그인·로그아웃, Secure/HttpOnly/SameSite 쿠키, Origin/CSRF, 저장 실패 안내, 한글 사진·증빙, CSV 다운로드, 기관별 파일 접근을 실제 도메인에서 검사한다. API 응답이 캐시되지 않는지 확인하고 데스크톱/390px 화면을 연다.

앱의 합성 데이터 한 건을 저장한 뒤 앱 컨테이너만 재시작하여 DB·첨부가 남는지 확인한다. 앱을 중지한 상태에서 같은 이미지의 일회성 컨테이너로 `npm run backup`을 실행한다. `/app/backups`는 `TRADE_BACKUP_DIR`에 바인드되어 백업이 컨테이너 삭제 후에도 볼륨2에 남는다. 복원 시험은 새 `restore-checks/` 부모 경로를 별도로 마운트하여 아직 없는 하위 경로로 복원한다. 기존 데이터 마운트 자체를 복원 대상 삼아 덮어쓰지 않는다. 복원 사본의 실제 로그인·파일 접근을 확인한다. 같은 NAS 볼륨의 백업만으로 NAS 장애 복구까지 검증했다고 주장하지 않는다.

문제가 있으면 새 `trade` 경로와 이 Compose 프로젝트만 중지하고 소스 릴리스·환경 경로를 이전 값으로 되돌린다. `down -v`, DB 삭제, `docker system prune`, 기존 서비스 전체 재시작은 사용하지 않는다.

## 현재 결과

Cloudflare 계정의 도메인 활성 상태와 기존 NAS Tunnel의 정상 연결을 읽기 전용으로 확인했다. 아직 NAS의 SSH 접속 계정·포트가 확인되지 않아 컨테이너 빌드·볼륨2 저장소 확인·DNS/경로 변경·실제 배포는 실행하지 않았다.

로컬 Node 24에서 서버 회귀 39개·브라우저 6개·빌드를 통과했고 NAS Compose 두 파일의 YAML 구문을 확인했다. 실제 Docker Compose 해석·컨테이너 실행 검증은 NAS 접속 후 수행한다.
