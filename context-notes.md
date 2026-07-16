2026-07-16 — 일괄 발송 + 목록 동그라미 제거

- 만족도·감사문자 담당자 목록 헤더에 「일괄 발송 (미발송 N)」을 발송 기록 왼쪽에 추가. 미발송만 순차 발송, 확인창 후 진행.
- 만족도는 템플릿 미지정 시 일괄 발송 차단.
- 담당자명 왼쪽 선택처럼 보이던 빈 동그라미(및 CheckCircle2 아이콘 칸) 제거. 발송 완료는 배지로만 표시.

2026-07-16 — 전체 반영 버튼

- 만족도 발송 패널에서 「반영하기」 우측 끝(`ml-auto`)에 「전체 반영 (N)」 추가.
- 현재 선택된 설문 템플릿을 해당 월 `sortedDisplayRecipients` 전원 링크에 freeze API로 일괄 고정.
- 제출된 초대는 건너뛰고, 전원 선택 템플릿 override도 함께 맞춤.

2026-07-15 — 반영하기 후에도 공개 링크가 예전 템플릿

## 원인
- 공개 링크는 `survey_invites.form_snapshot`만 봄. 「반영하기」는 이 스냅샷을 다시 고정해야 함.
- 브라우저에서 `freezeInviteSnapshot`을 호출하면 `isDevMode()`(특히 `localStorage` force-dev)일 때 **로컬 store에만** 쓰고, `survey.withspace.kr`는 Supabase DB를 읽어 예전 템플릿이 남음.
- update가 0행이어도 error 없이 성공으로 처리되던 경우도 있음.

## 결정
- 반영·발송 고정은 `POST /api/survey/[token]/freeze`로 서버에서만 수행 (서버는 force-dev와 무관).
- `templateId`가 있으면 이전 스냅샷과 ID/내용 병합하지 않고 템플릿으로 완전 교체.
- 저장 후 `select`로 `templateId` 일치 검증. 공개 GET은 `force-dynamic` + 캐시버스트.

2026-07-02

- 무료 플랜 Egress 절감을 위해 문자 상태 추적은 실시간성보다 조회량 축소를 우선한다.
- 발송 기록은 모달을 열었을 때만 해당 캠페인/기간 범위로 읽고, 백그라운드 폴링은 pending 건만 최소 범위로 조회한다.
- 문구 override와 프로젝트 목록도 현재 화면에 필요한 범위/컬럼만 읽도록 줄인다.
- 적용 내용: pending 폴링은 10초 간격/최대 5분으로 제한했고, 로그는 pending 전용 조회와 모달 범위 조회로 분리했다.
- 적용 내용: 문구 override는 현재 월(`survey`) 또는 현재 날짜(`thank_you`)만 읽고, 메인 `projects` 목록은 필요한 컬럼만 조회하도록 바꿨다.
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
