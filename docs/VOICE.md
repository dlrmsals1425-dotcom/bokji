# 말로 찾기: 자체 모델 STT

/situation의 자유문장 입력에 음성 입력을 제공한다. 브라우저가 녹음한 음성을 Next 서버가 자체 STT 서버에 전달하고 한국어 전사문을 돌려받는다. 사용자가 확인·수정하고 **입력칸에 넣기**를 눌러야 기존 글 뒤에 추가된다.

## STT와 TTS, 운영 방식

- **STT**는 음성 → 글이며 이번 기능에 필요한 모델이다. [faster-whisper](https://github.com/SYSTRAN/faster-whisper)의 small 다국어 모델을 한국어 고정, CPU int8로 실행한다.
- **TTS**는 글 → 음성이다. 사용자가 제시한 [Qwen3-TTS MLX 8bit](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit)는 음성 생성 모델이므로 입력 인식에는 쓸 수 없다. 해당 [mlx-audio](https://github.com/Blaizzy/mlx-audio) 경로는 Apple Silicon을 대상으로 하며 이 Windows PC의 음성 입력에 바로 적용하는 구성은 아니다.
- 로컬 모델도 서버에서 API로 제공할 수 있다. **사용자 브라우저 → 웹 서버 → 자체 STT 서버 → 문장** 구조로 방문자는 모델을 설치하지 않는다. 외부 유료 API 키는 필요 없으며 운영 서버 비용은 별도다.
- 현재 웹(3220)과 모델(8767)은 이 PC에만 실행했다. PC를 끄면 사용할 수 없다. 공개 서비스로 사용하려면 웹과 모델 서버를 배포해야 한다. 공개 배포·외부 접속 개방·main 병합은 이번 작업에서 하지 않았다.

## 사용자 동작

1. 음성 처리 안내에 동의하고 **음성 입력 시작**을 누른다.
2. 마이크 권한을 허용하고 사는 곳과 상황을 말한다.
3. 다 말하면 **말하기 완료**를 누른다. 중간 침묵을 종료 신호로 사용하지 않는다. 실제 녹음 시작부터 최대 60초다.
4. 마이크를 끄고 서버에서 글로 변환한다. 실시간 자막 방식은 아니다.
5. 문장을 확인·수정한 뒤 **입력칸에 넣기**, 이어서 기존 **이 문장으로 아래 칸 채우기**를 사용한다.

기존 글 뒤에 공백으로 한 번만 붙인다. 합산 500자를 넘으면 자르지 않고 수정 안내를 표시한다. 취소·동의 철회·수동 수정·대상 변경·문장 해석·화면 이동·탭 숨김은 녹음과 미확인 초안을 폐기한다. 늦은 응답은 적용하지 않는다. 이미 시작한 CPU 추론은 취소 뒤에도 끝날 때까지 실행될 수 있다.

## 데이터와 제한

- MediaRecorder와 getUserMedia를 지원하는 HTTPS 또는 localhost 계열 환경이 필요하다. WebM/Opus, MP4, Ogg 중 지원 형식을 고른다. 브라우저 Web Speech 서비스는 사용하지 않는다.
- 동의와 시작 후 먼저 서버 상태를 확인하고 마이크를 연다. 준비 대기 20초, 녹음 60초, 녹음 중지 정리 3초, 변환 대기 120초 제한이다.
- 음성은 웹과 모델 서버 메모리에서 처리하며 별도 파일·전사문 로그로 보관하지 않는다. 응답은 no-store, 모델 접근 로그는 비활성화했다. 배포 프록시/APM에서도 본문 수집을 켜지 않아야 이 정책이 유지된다.
- 인증용 임의 비밀값은 서버 환경변수로만 사용한다. NEXT_PUBLIC_ 접두사를 붙이거나 브라우저에 전달하지 않는다. 업로드 출처 확인에는 실제 Host를 사용하며 임의 X-Forwarded-Host는 사용하지 않는다. Next 내부 URL은 localhost로 정규화될 수 있다.
- 업로드 8MiB, 디코딩 후 62초(코덱 여유 포함), 업로드 대기 15초 제한이다. 웹 프로세스당 최대 2개 요청, 모델 추론은 1개다. 혼잡 시 429를 반환한다. 분산 환경 전체의 호출 횟수 제한은 아니다.
- 무음·오류·거절에서는 직접 입력을 유지한다. 무음 진폭 검사와 VAD가 모든 잡음에서 환각을 방지하는 것은 아니므로 확인창에서 사용자가 검토한다.

## Windows 로컬 실행

bokji-voice / jinwoo에서 실행한다. Python 3.13과 CPU int8로 검증했다. 최초 패키지·모델 설치에는 인터넷이 필요하다. 모델은 .models/에 저장하며 이후 추론에 외부 STT 호출은 필요 없다.

~~~powershell
py -3.13 -m venv .venv-stt
.venv-stt/Scripts/python.exe -m pip install -r local-stt/requirements.txt
.venv-stt/Scripts/python.exe scripts/setup-stt.py
pwsh -NoProfile -File scripts/start-local-stt.ps1
~~~

setup-stt.py는 .env.local의 비어 있거나 없는 STT 설정만 채운다. URL은 http://127.0.0.1:8767, 인증 비밀값은 무작위 생성한다. 기존 다른 설정은 보존하고 비밀값은 출력하지 않는다. 별도 터미널에서 웹을 시작한다.

~~~powershell
npm.cmd ci
npm.cmd run build
npm.cmd run start -- -p 3220 -H 127.0.0.1
~~~

[음성 화면](http://127.0.0.1:3220/situation). 환경 설정을 바꾸면 웹도 재시작한다. 가상환경·모델·비밀값·시험 음성과 로그는 Git에서 제외한다.

## 서버에 옮길 때

별도 Python 프로세스나 local-stt/Dockerfile로 모델을 실행할 수 있다. Docker는 이 PC에 없어 이미지 빌드는 미검증이다. 아래는 같은 서버의 Next 프로세스에서 loopback으로 연결하는 예시다.

~~~sh
docker build -t bokji-stt ./local-stt
# .env.stt에는 STT_SERVICE_TOKEN만 설정. 웹 서버와 같은 32자 이상 임의값.
docker run --rm --env-file .env.stt -p 127.0.0.1:8767:8767 bokji-stt
~~~

웹에는 STT_SERVICE_URL과 동일한 STT_SERVICE_TOKEN을 설정한다. 모델이 다른 호스트라면 TLS 프록시 뒤에 두고 https://stt.example.com 같은 루트 HTTPS URL을 사용한다. 원격 HTTP나 경로·쿼리가 붙은 URL은 거절한다. 웹 프록시는 원래 Host와 HTTPS 스킴을 정확히 전달해야 한다.

공개 운영 시 프록시에서 요청 크기·사용자/IP별 호출 횟수·시간 제한을 설정한다. 플랫폼의 업로드 제한이 8MiB보다 작거나 함수 실행 제한이 120초보다 짧다면 그 한도도 적용된다. CPU 동시 추론은 1개이므로 부하 시험 후 서버 규모를 결정한다. GPU·자동 확장·대기열은 구현하지 않았다.

## 검증

2026-10-16, 이 브랜치의 새 구현에서 직접 실행한 결과다.

| 검사 | 결과 |
|---|---|
| 녹음/웹 API/문장/기존 parse 단위 | 111/111 (22 + 27 + 27 + 35) |
| Python 인증·길이·무음·혼잡 검사 | 8/8 |
| 가짜 마이크/HTTP로 UI 흐름 검증 | 22/22 (데스크톱 18, 모바일 4) |
| lint / 전체 타입 / 프로덕션 빌드 | 통과 |
| 실제 모델 + 합성 한국어 WAV | 10.13초 음성(3초 침묵 포함)에서 수원·일자리·월세 변환, 모델 직접 호출 약 6.25초; 무음 422 |
| 실제 Next API + 같은 합성 WAV | 문장 변환 통과, 약 4.97초; 무음 422 |
| 실제 Chromium MediaRecorder → Next → 모델 → 확인창 | 1/1 통과, 합성 WAV를 가짜 마이크로 재생 (총 17.5초, 녹음 시간 포함) |

실제 연결 검사에서 Next의 내부 URL 정규화로 정상 Origin까지 거절되는 문제를 발견해 수정하고 회귀 검사를 추가했다. 실제 웹 경유와 브라우저 인코딩 검사까지 통과했다. 위 시간은 단일 합성 샘플의 실행 시간이며 일반적인 인식 지연이나 정확도 측정값이 아니다. 재현 명령은 다음과 같다.

~~~powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- tests/unit/voice-recorder.test.ts tests/unit/voice-route.test.ts tests/unit/voice-text.test.ts tests/unit/parse.test.ts --maxWorkers=1
.venv-stt/Scripts/python.exe -m unittest discover -s local-stt -p test_server.py -v
$env:E2E_BASE_URL='http://127.0.0.1:3220'
npm.cmd run e2e -- tests/e2e/voice.spec.ts --workers=1
# 수원·일자리·월세를 넣은 합성 음성 fixture를 만든 뒤:
.venv-stt/Scripts/python.exe scripts/smoke-stt.py logs/stt-korean.wav
$env:STT_TEST_WAV='logs/stt-korean.wav'
npm.cmd run e2e -- tests/e2e/voice-model.spec.ts --project=desktop-chromium --workers=1
~~~

**미검증:** 실제 사용자 마이크·말투·잡음별 정확도, 실제 휴대폰/Safari, 다중 사용자 부하, Docker, 공개 배포. 모바일 검사는 Chromium 에뮬레이션이다. 전체 앱 단위/E2E 통과를 주장하지 않는다.

## 변경 범위와 이력

브라우저 SpeechRecognition을 MediaRecorder + 자체 모델 API로 교체했다. 첫 final에서 종료하던 문제는 연속 인식으로 한 번 수정했지만 브라우저 서비스의 종료 정책을 제어할 수 없어 이번 구조로 바꿨다. 이전 91개 단위/20회 E2E는 이전 구현 기록이다.

질문 흐름·추천 알고리즘·데이터·/ask는 바꾸지 않는다. 기존 화면에 음성 컨트롤과 필요한 개인정보 안내만 적용한다. 핵심 파일은 src/lib/voice/recorder.ts, src/app/api/voice/transcribe/route.ts, local-stt/server.py, src/components/VoiceInput.tsx다.
