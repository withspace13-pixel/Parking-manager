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
