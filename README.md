# 주차권 관리 및 자동 정산 프로그램

PC 기반 주차권 관리·자동 정산 앱입니다. 기관명·담당자 단위로 프로젝트를 등록하고, 일자별 룸 설정, 주차권 발급, 1일 1대 무료 정산을 지원합니다.

## 기술 스택

- **Next.js** (App Router)
- **Tailwind CSS**
- **Supabase** (DB·API)

## 개발자 모드 (Supabase 없이 UI만 수정할 때)

`.env.local`에 Supabase URL/키를 **넣지 않으면** 자동으로 **개발자 모드**로 동작합니다.

- 데이터는 **브라우저 localStorage**에만 저장됩니다 (새로고침해도 유지).
- 기관 등록, 룸 설정, 주차권 입력, 정산 화면까지 모두 동일하게 사용할 수 있어 **UI·플로우 수정**에 적합합니다.
- 상단에 **「개발자 모드 (로컬 저장)」** 배지가 보이면 이 모드로 동작 중인 것입니다.
- 나중에 GitHub에 푸시하고 Supabase를 연동할 때는 `.env.local`만 채우면 DB 모드로 전환됩니다.

### 로컬 실행만 할 때

```bash
npm install
npm run dev
```

`.env.local` 없이 위만 실행하면 개발자 모드로 동작합니다.

---

## 설정 (Supabase 연동 시)

### 1. Supabase 테이블 생성

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. 대시보드 → **SQL Editor**에서 아래 SQL 실행

```sql
-- supabase/migrations/001_initial_schema.sql 파일 내용 전체 복사 후 실행
```

또는 `supabase/migrations/001_initial_schema.sql` 파일 내용을 복사해 SQL Editor에 붙여넣고 실행하세요.

### 2. 환경 변수

프로젝트 루트에 `.env.local` 파일을 만들고 Supabase 정보를 넣습니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

(예시는 `.env.local.example` 참고)

### 3. 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 으로 접속합니다.

## 기능

| 화면 | 설명 |
|------|------|
| **대시보드** (/) | 등록된 기관 목록. 기관별 룸 설정 / 주차권 / 정산 링크 |
| **기관 등록** (/projects/new) | 기관명, 담당자, 사용 일자, 주차지원 여부, 비고. 일자별 룸 입력 및 **룸 일괄 적용** |
| **룸 설정** (/projects/[id]/rooms) | 기존 프로젝트의 날짜별 룸 수정, 일괄 적용, 저장 |
| **주차권 등록** (/projects/[id]/parking) | 일자 선택 후 차량 4자리 + 권종 수량 입력. Enter로 권종 칸 이동, 키보드만으로 빠른 입력, **실시간 Supabase 저장** |
| **정산** (/projects/[id]/settlement) | 기관·담당자 강조, 전체 기간 발급 수량·정산 금액, 일자별 1일 1대 무료 적용 내역 (날짜 순) |

### 정산 규칙

- **1일 1대 무료**: 해당 날짜에 발급된 차량 중 **당일 발급 총액이 가장 높은 차량 1대**를 선정해, 그 차량의 해당 일자 내역을 0원 처리합니다.
- 정산 합계에는 위 무료 적용이 반영된 금액이 표시됩니다.

## DB 구조 요약

- **projects**: id, org_name, manager, start_date, end_date, parking_support, remarks
- **project_rooms**: id, project_id, date, room_name (project_id + date UNIQUE)
- **parking_records**: id, project_id, vehicle_num, date, all_day_cnt, 2h_cnt, 1h_cnt, 30m_cnt (project_id + vehicle_num + date UNIQUE)

권종 단가: 종일권 30,000원, 2시간 12,000원, 1시간 6,000원, 30분 3,000원.
