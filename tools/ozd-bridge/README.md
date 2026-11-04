# 비공개 OZD 변환 브릿지

이 폴더는 **물품이음 내부 HTTP 연결 도구**다. FORCS/OZ의 공개 API·변환 엔진·라이선스가 아니다. OZD 바이너리를 Node.js나 조달청 API가 자체 해석한다고 주장하지 않는다.

## 실제 작동에 필요한 것

기관에서 허용한 OZ Viewer/Report SDK 또는 내보내기 엔진이 있는 별도 호스트에 배치한다. 설치 버전·라이선스에서 허용하는 OZD 열기→XLSX 내보내기 절차를 검증한 어댑터를 먼저 준비한다. **기본 상태에는 실제 변환 엔진이 없고 `/convert`는 503 ENGINE_NOT_CONFIGURED를 반환한다.**

현재 공급자 문서의 범위: OZ Viewer에는 XLS/XLSX 등의 저장·내보내기 기능과 일부 환경의 `save_memorystream`/`OZExportMemoryStreamCallBack` 인터페이스가 있다. 설치 버전별 호출 방법과 권한은 별도로 확인해야 한다. 이 저장소는 검증하지 않은 EXE 인수·ActiveX ProgID·SDK 배포 파일을 포함하지 않는다.

공식 자료: https://kr.forcs.com/file/manual/kr/documentation-rv_dev/welcome_to.htm
https://global.forcs.com/file/manual/global/documentation-rv_dev/rv_method_script_commands_s.htm

## 설치 및 실행 (변환 호스트의 소스 작업 사본)

1. 저장소 소스와 Node24를 준비한다. DB나 실제 업무 서버 설정을 복사할 필요는 없다.
2. 이 `.env.example`을 저장소 루트의 **`.env.ozd`**로 복사한다. 기존 `.env`/`.env.nas`를 덮어쓰지 않는다.
3. 충분히 긴 별도 토큰을 서버/브릿지 양쪽 비밀설정에 넣는다. API 키와 재사용하지 않는다.
4. 검증된 실행파일의 절대경로와 정확한 인수를 설정한다. `OZD_CONVERTER_ARGS_JSON`에 `{input}`, `{output}` 자리표시자를 넣는다. 사용자 업로드 파일명은 인수에 쓰지 않고 서버가 만든 임시 경로만 전달한다.
5. 엔진의 사용 허가와 내보내기를 확인한 뒤 `OZD_ENGINE_APPROVED=true`, `npm run ozd:bridge`.
6. Bearer 인증이 있는 `/health`로 engineConfigured를 확인한다. 개인정보 없는 실제 OZD로 원본표와 변환표를 대조한 뒤 앱의 OZD 연결을 활성화한다.

원격 NAS가 연결해야 한다면 승인된 사설망과 TLS 역방향 프록시로 제한한다. 공개 인터넷으로 변환 서비스를 노출하지 않는다. 비루프백 바인딩은 `OZD_PRIVATE_NETWORK_APPROVED=true`를 별도 요구한다. plain HTTP 사설망은 앱 쪽에도 명시적 허용이 필요하며 기본 비활성이다. 브라우저가 브릿지에 직접 요청하지 않는다.

## 내부 계약

`POST /convert` · `Authorization: Bearer <별도 토큰>` · `Content-Type: application/octet-stream` · `X-Source-SHA256: <원본 해시>` · body=OZD 원본. 성공 시 XLSX bytes와 같은 source hash 반환. 원본 파일명·기관명·조달청 키·AI 키는 전송하지 않는다.

앱은 반환 해시·MIME·8MB 크기·ZIP signature를 확인한 뒤 기존 격리 XLSX 파서로 다시 검증한다. 브릿지의 해시는 응답 연결을 확인하는 장치이지 의미상 정확한 변환을 보증하지 않는다.

## 안전·운영

동시 변환1건, 입력/출력8MB, 프로세스 시간제한, `shell:false`, 정적 실행파일·인수, 임시 디렉터리 격리, stdout/stderr 비수집, 원본 해시 확인, 결과 파일 심볼릭 링크 거부. 엔진에는 필요한 OS/라이선스 환경만 넘기고 앱의 AI/조달청 키를 넘기지 않는다. 작업 후 자신이 만든 임시 디렉터리만 정리한다. 원본은 앱의 SQLite에 별도로 보존된다.

이 제한이 엔진 자체를 OS 수준 샌드박스로 만드는 것은 아니다. 전용 저권한 계정/VM·패치·망 제한·악성파일 검사·라이선스 보안을 운영자가 준비해야 한다. 실제 엔진이 없으면 임의 프로그램 다운로드나 비공식 로그인 자동화를 하지 말고 앱의 변환대기→수동 XLSX 연결 경로를 사용한다.
