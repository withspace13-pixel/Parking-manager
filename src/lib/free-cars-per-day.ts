// 프로젝트별 일일 무료 주차 대수(1~5) 정규화
export function clampFreeCarsPerDay(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 5) return 5;
  return n;
}
