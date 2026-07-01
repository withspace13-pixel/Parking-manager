# 솔라피 연동 — context notes

## 결정
- **발송 경로**: 브라우저 → Next.js API Route → Solapi SDK (API Key/Secret은 서버 env만)
- **SMS/LMS**: 본문 길이에 따라 Solapi SDK가 자동 분기 (90바이트 기준은 UI `estimateMessageType`과 동일)
- **발송 완료 상태**: 솔라피 상태코드 `4000`(발송 완료)일 때만 localStorage `sent`에 추가. 그 외는 미발송 유지.
- **발송 완료 취소**: `sent` localStorage에서만 제거. 솔라피 발송 기록은 유지.
- **발송 API**: 접수 직후 응답, 최종 상태는 클라이언트 `sms-pending-tracker`가 2초 간격 폴링 (탭·창 전환·다른 대시보드 탭 이동 후 복귀 시에도 localStorage 기반으로 재개).
- **발송 기록 UI**: 담당자 목록 헤더 우측 버튼 → 모달 (`SmsSendLogModal`).
- **더미 번호 차단 없음**: `01000000000` 등도 솔라피에 보내고 실제 상태코드로 판단.
- **env**: `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER` (등록 발신번호, 숫자만)

## 미설정 시
- `/api/messages/status` → `configured: false`, UI에 안내 문구
- 발송 API → 503 + 설정 안내 메시지
