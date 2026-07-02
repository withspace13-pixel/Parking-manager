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
