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

기본은 **Webpack**(`next dev`)입니다. Windows에서 **저장할 때마다** `ENOENT` / `app-build-manifest.json` 오류가 나거나 화면이 하얗게 뜨면, 대부분 **Turbopack**(`next dev --turbo`) 대신 Webpack을 쓰면 완화됩니다.  
더 빠른 빌드를 원하면 **`npm run dev:turbo`** 로 Turbopack을 쓸 수 있습니다 (가끔 캐시가 꼬일 수 있음).

`.env.local` 없이 위만 실행하면 개발자 모드로 동작합니다.

### `Cannot find module './xxx.js'` (개발 서버)

`.next` 캐시가 소스와 어긋나면 저장·화면 이동 직후 위 오류가 날 수 있습니다.

- 한 번에 지우고 다시 띄우기: **`npm run dev:clean`** (기본: Webpack)
- Turbopack으로 캐시 비우고 재시작: **`npm run dev:clean:turbo`**
- 또는 개발 서버를 끄고 `npm run clean` 후 `npm run dev`
- Windows PowerShell: `Remove-Item -Recurse -Force .next` (또는 `npm run clean` — `.next` + `node_modules/.cache` 삭제)

### `ENOENT` / `app-build-manifest.json` 없음

`.next` 폴더가 지워졌거나 빌드가 끊기면 **정산·보고서 등 동적 라우트** 이동 시 터미널에 위 오류가 날 수 있습니다. 브라우저에는 `missing required error components` 같은 문구만 보일 수 있습니다.

1. **개발 서버 완전 종료** (Ctrl+C)
2. **`npm run dev:clean`** 실행 (`.next` 삭제 후 **Webpack**으로 재시작 — 권장)
3. **Turbopack을 쓰는 중이었다면** 앞으로는 **`npm run dev`**(Webpack 기본)만 쓰는 것을 권장합니다.
4. 그래도 같으면 **`npm run dev:clean:turbo`** 대신 2번만 반복해 보세요.

(코드 저장·HMR마다 `app-build-manifest.json` ENOENT가 난다면 **Turbopack**이 원인인 경우가 많습니다. 기본 스크립트는 Webpack으로 바꿔 두었습니다.)

### 화면이 갑자기 “스타일 없음”처럼 보일 때

글자만 왼쪽에 세로로 쌓이면 **Tailwind CSS가 안 붙은 상태**입니다.

1. **개발 서버를 완전히 끄고** 프로젝트 폴더에서 **`npm run dev:clean`**
2. 브라우저 **강력 새로고침** (Ctrl+Shift+R) 또는 시크릿 창으로 `localhost:3000` 접속
3. 그래도 같으면 Turbo 없이 **`npm run dev`** 인지 확인 (`package.json` 기본값)

(개발자 모드에서 기관이 없으면 **「등록된 기관이 없습니다」** 만 나오는 것은 데이터가 비어 있어서일 수 있습니다.)

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
| **대시보드** (/) | 등록된 기관 목록. **수정**(기본·일정·룸 통합) / 주차권 / 정산 링크 |
| **기관 등록** (/projects/new) | 기관명, 담당자, 사용 일자, 주차지원 여부, 비고. 일자별 룸 입력 및 **룸 일괄 적용** |
| **기관 수정** (/projects/[id]/edit) | 등록 화면과 동일하게 기본 정보 + 일정(복수 구간) + **날짜별 룸**을 한 번에 저장 |
| **룸 설정** (/projects/[id]/rooms) | → `/edit`로 **리다이렉트**(예전 북마크 호환) |
| **주차권 등록** (/projects/[id]/parking) | 일자 선택 후 차량 4자리 + 권종 수량 입력. Enter로 권종 칸 이동, 키보드만으로 빠른 입력, **실시간 Supabase 저장** |
| **정산** (/projects/[id]/settlement) | 기관·담당자 강조, 전체 기간 발급 수량·정산 금액, 일자별 1일 1대 무료 적용 내역 (날짜 순) |

### 보관함 자동 삭제

- **행사 종료일(`end_date`)이 지난** 행사는 보관함으로 분류됩니다.
- 보관함에 **올라간 뒤(종료일 기준) 30일이 지나면**, 대시보드(/)를 열 때 **자동으로 삭제**됩니다. (주차권·룸 등 연관 데이터는 DB CASCADE로 함께 삭제)
- 상수는 `src/lib/archive-retention.ts`의 `ARCHIVE_RETENTION_DAYS`에서 변경할 수 있습니다.

#### 보관함 자동 삭제 — 테스트 방법 (한 달 기다리지 않기)

삭제 조건은 **`오늘 날짜 > 종료일 + 30일`** 입니다. 아래 중 하나로 확인하면 됩니다.

1. **종료일만 과거로 두기 (권장)**  
   테스트용 행사의 **`end_date`를 오늘보다 31일 이상 과거**로 맞춥니다.  
   - 개발자 모드: 기관 **수정** 화면에서 사용 일자 종료일을 과거로 저장하거나, `localStorage`의 데이터를 직접 고치기보다는 수정 화면이 안전합니다.  
   - Supabase: Table Editor에서 해당 `projects` 행의 `end_date`를 예: `2025-01-01` 처럼 넣기.  
   그다음 **대시보드 `/`를 새로고침**하면 해당 행사가 자동 삭제되는지 확인합니다.

2. **보관 기간 숫자를 잠깐 줄이기**  
   `archive-retention.ts`의 `ARCHIVE_RETENTION_DAYS`를 **`0`**으로 두면, **종료일이 오늘보다 이전**인 행사(이미 보관함)는 다음 대시보드 방문 시 삭제 대상이 됩니다.  
   (조건: `오늘 > 종료일 + 0` → 어제까지 끝난 행사는 오늘 삭제)  
   테스트 후 **`30`으로 되돌리기.**

3. **PC 날짜 바꾸기**  
   OS 날짜를 31일 뒤로 맞추는 방법도 있지만, 다른 앱에 영향이 있어 **1번**을 추천합니다.

### 정산 규칙

- **1일 1대 무료**: 해당 날짜에 발급된 차량 중 **당일 발급 총액이 가장 높은 차량 1대**를 선정해, 그 차량의 해당 일자 내역을 0원 처리합니다.
- 정산 합계에는 위 무료 적용이 반영된 금액이 표시됩니다.

## DB 구조 요약

- **projects**: id, org_name, manager, start_date, end_date, parking_support, remarks
- **project_rooms**: id, project_id, date, room_name (project_id + date UNIQUE)
- **parking_records**: id, project_id, vehicle_num, date, all_day_cnt, 2h_cnt, 1h_cnt, 30m_cnt (project_id + vehicle_num + date UNIQUE)

권종 단가: 종일권 30,000원, 2시간 12,000원, 1시간 6,000원, 30분 3,000원.
