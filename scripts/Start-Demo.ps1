$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 24.x를 먼저 설치해 주세요.' }
$major = node -p "process.versions.node.split('.')[0]"
if ($major.Trim() -ne '24') { throw '이 프로그램은 Node.js 24.x를 사용합니다. 현재 버전을 확인해 주세요.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw '의존성 설치 실패' }
npm run build
if ($LASTEXITCODE -ne 0) { throw '빌드 실패' }
Write-Host '브라우저 주소: http://localhost:4310 (합성 시연 데이터)'
npm run demo
