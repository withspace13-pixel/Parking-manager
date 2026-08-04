- [x] 문자 pending 폴링을 10초 간격, 최대 5분으로 축소
- [x] 발송 기록 조회를 모달 오픈/수동 새로고침 기준으로 축소
- [x] 문구 override 조회를 현재 월/날짜 범위로 제한
- [x] 메인 프로젝트 목록 조회에서 `select("*")` 제거
- [x] 빌드로 변경 사항 검증
# 솔라피 문자 발송·상태 추적

- [x] solapi SDK 설치
- [x] 서버 발송 모듈 (`src/lib/solapi-server.ts`) — 발송 후 최대 45초 폴링
- [x] API Route (`/api/messages/send`, `/api/messages/status`, `/api/messages/refresh`)
- [x] 상태코드 분류 (`src/lib/solapi-status.ts`) — 4000만 발송 완료
- [x] 발송 기록 localStorage (`src/lib/sms-send-log.ts`)
- [x] 발송 기록 UI (`SmsSendLogPanel`)
- [x] ThankYouSmsPanel / SatisfactionSurveyPanel — 실제 상태 반영, 발송 완료 취소
- [x] `.env.local.example` 업데이트
- [x] 빌드 확인

# 반영하기 후에도 템플릿 1로 보이는 문제 (2026-07-15)

- [x] freezeInviteSnapshot: templateId 지정 시 이전 스냅샷 병합 금지
- [x] DB update 후 select로 저장 검증 (0행·templateId 불일치 시 에러)
- [x] POST `/api/survey/[token]/freeze` — 서버에서 고정 (클라이언트 isDevMode/localStorage 우회)
- [x] 발송·반영하기는 freeze API 사용
- [x] 설문 GET 캐시 무력화 (`force-dynamic` + `?_=` 타임스탬프)
- [ ] 배포 후 템플릿 2 선택 → 반영하기 → 실링크에서 템플릿 2인지 확인

# 주차 시간 계산기 커스텀 타임피커 (2026-08-04)

- [x] `TimePickerInput` — 24시간 `HH:MM` 텍스트 입력 (`:` 고정)
- [x] 시(00~23) 두 자리 입력 후 분으로 포커스, 분 완료 시 출차로 포커스
- [x] `ParkingDurationCalculator`에 연결
- [ ] 화면에서 입·출차 입력·포커스 이동 확인
