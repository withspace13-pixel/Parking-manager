/** 보관함(행사 종료) 데이터를 며칠 보관한 뒤 자동 삭제할지 */
export const ARCHIVE_RETENTION_DAYS = 30;

/** YYYY-MM-DD + n일 (로컬 달력 기준) */
export function addDaysToYmd(ymd: string, days: number): string {
  const s = String(ymd).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * 행사 종료일(end_date) 이후 ARCHIVE_RETENTION_DAYS일이 지난 행사 → DB/로컬에서 삭제
 * (보관함에 올라간 뒤 30일이 지난 것으로 간주)
 */
export function isArchivedProjectExpiredForPurge(endDateYmd: string, todayYmd: string): boolean {
  const end = String(endDateYmd).slice(0, 10);
  const today = String(todayYmd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  if (end >= today) return false;
  const deadline = addDaysToYmd(end, ARCHIVE_RETENTION_DAYS);
  return today > deadline;
}
