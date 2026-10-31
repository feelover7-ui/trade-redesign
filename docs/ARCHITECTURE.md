# 구조와 업무 불변조건

## 실행 구조

```text
브라우저 React + TypeScript (Vite 빌드)
        ↓ same-origin /api + HttpOnly session + CSRF
Express 5 서버
 ├─ service.mjs: 상태/수량/권한/증빙 규칙
 ├─ db.mjs: Node 24 DatabaseSync + WAL + 트랜잭션
 ├─ app.mjs: 파일 접근·입력 검증·내보내기
 ├─ integrations.mjs: 외부 연계 내부 계약 (모두 미연결)
 └─ DATA_DIR/trade.sqlite + uploads/
```

서버는 단일 프로세스 배포를 기본으로 한다. 예약은 SQLite `BEGIN IMMEDIATE`의 트랜잭션 안에서 현재 배정 수량을 다시 계산한다. DB는 브라우저 localStorage가 아니다. SQL은 입력값을 매개변수로 바인딩한다. 이미지·증빙은 정적 공개 디렉터리에 놓지 않고 매 요청의 소속·거래 권한을 검사한다.

## 모델

`organizations → users/sessions → lots → groups → requests`

`assets → lot_id → case_assets(request_id, quantity)`

`files → lots 또는 requests → case_steps`

`requests → messages`, `users → favorites`, 모든 중요한 변경 → `audit_events`.

`lots.source_snapshot`은 최초 대장 정보, `lots.data`는 현물 조사·신청 준비 정보다. CSV `assets.snapshot`과 원본 품명·번호·수량은 DB 트리거로 직접 갱신도 차단한다. 현재 원본 자산행 하나를 여러 묶음에 나누어 연결하지 않지만, 한 묶음 안에서 여러 인수기관에 수량을 나누어 배분할 수 있다.

## 상태

```text
묶음: DRAFT → REVIEW → PUBLISHED → PAUSED
                        ↑          ↓
                        └─ 재검토 REVIEW
불용결정: UNVERIFIED → VERIFIED → REVOKED
신청: REQUESTED → RESERVED → SENT → RECEIVED → DONE
                                   ↓          ↑
                                 DISPUTED ────┘ (전량 도착 확인에 한함)
신청 취소: REQUESTED/RESERVED → DECLINED 또는 CANCELLED
```

`RESERVED`는 예비 배정이다. 공식 승인이 아니다. `DONE`은 수동 문서 확인 완료이다. API로 검증된 공식 행정완료 상태는 이번 버전에 없다.

**가용량** = 공유 가능한 상태그룹 수량 − RESERVED/SENT/RECEIVED/DISPUTED/DONE 상태의 배정 수량 합계. 불일치·완료 수량은 임의로 다시 공개 재고가 되지 않는다. REQUESTED는 수요표명으로만 취급하며 재고를 차감하지 않는다.

## 필수 관문

- 게시: 같은 기관 내 작성자와 다른 검토자 + 완료된 결정 근거·대상목록·날짜·사진·증빙 + 실사 수량 일치/차이사유 + 재사용·개인정보·조회범위 확인.
- 예약: 신청 상태, 같은 기관 신청 금지, 게시/결정 유효, 가용 수량 충분, 원자 처리.
- 인계: 공식 조회결과, 양 기관 합의와 인계·인수 승인 증빙, 이번 수량의 자산 연결, 저장매체 삭제 증빙(해당시), 현물 확인.
- 인수: 받는 기관만 기록. 차이는 보류. 인계보다 많은 수량은 거부.
- 증빙 완료: 실물 수량 일치, 양 기관 대장 반영 증빙, 게시·결정 유효.
- 취소: 인계 전만 가능. 이후 정정은 별도 업무 확장 대상.

## 권한

| 역할 | 범위 |
|---|---|
| EDITOR | 자기 기관 등록·편집·신청·예비배정·실물 확인, 공개 물품 검색 |
| REVIEWER | EDITOR 업무 + 자신의 기관 증빙 검토. 자신이 작성한 물품 게시 승인은 불가 |
| ADMIN | 기관·계정 발급·중지, 운영 감사. 업무 물품 조회/게시/증빙 승인 권한 없음 |

내부 결재문서·자산번호는 타 기관의 물품 목록에 포함되지 않는다. 거래에 연결한 증빙은 해당 거래 참여 두 기관에만 공유된다.

## 내부 HTTP API (공식 에듀파인 API가 아님)

- `/api/auth/login|me|logout|password`
- `/api/lots`, `/api/lots/:id`, `submit|review|pause|reopen|favorite|assets`
- `/api/assets`, `/api/assets/import`
- `/api/requests`, `/api/requests/:id`, `reserve|cancel|decline|steps|assets|handover|receive|complete|messages|export`
- `/api/files` 업로드, `/api/files/:id` 권한 확인 후 읽기/초안 삭제
- `/api/export/assets.csv`, `/api/export/lots.csv`, `/api/lots/:id/onbid.zip`
- `/api/admin`, `/api/admin/organizations`, `/api/admin/users`, `/api/admin/users/:id/status`
- `/api/audit`, `/api/meta`, `/api/health`

로그인 외 쓰기에는 정확한 `Origin`과 세션에 바인딩된 `X-CSRF-Token`이 필요하다. 신청 생성은 `Idempotency-Key`도 필수다. 외부 API 키를 전달하는 경로나 클라이언트 환경변수는 없다.

## 외부 연계 확장

현재 `capabilities`는 모두 false다. `EdufineAdapter`, `ProcurementAdapter`, `OnbidAdapter`, `AiAdapter`는 가짜 응답 대신 `NOT_CONNECTED` 오류를 던진다. 실제 명세·사용승인 확보 후 이 내부 계약을 구현하고, 기관권한·외부참조번호·확인시각·원문해시·요청멱등키를 보존하는 별도 마이그레이션을 추가한다. 수동 확인과 공식 API 확인의 출처를 혼합하지 않는다.
