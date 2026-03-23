import type { Project } from "@/lib/supabase";

/** Windows 등에서 쓸 수 없는 파일명 문자 제거 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

/** YYYY-MM-DD → MMDD */
function toMmdd(ymd: string): string {
  const d = String(ymd).slice(0, 10);
  if (d.length < 10) return d;
  return d.slice(5, 7) + d.slice(8, 10);
}

/**
 * 예: `주차권 내역) 위드스페이스_강민재 담당자_ 0318-0402.pdf`
 * (사용일자 범위: MMDD-MMDD, 하루만이면 MMDD 하나)
 */
export function buildParkingHistoryPdfFilename(
  project: Pick<Project, "org_name" | "manager" | "start_date" | "end_date">
): string {
  const start = String(project.start_date).slice(0, 10);
  const end = String(project.end_date).slice(0, 10);
  const a = toMmdd(start);
  const b = toMmdd(end);
  const range = a === b ? a : `${a}-${b}`;
  const raw = `주차권 내역) ${project.org_name}_${project.manager} 담당자_ ${range}`;
  return `${sanitizeFilename(raw)}.pdf`;
}

/**
 * 정산/보고서 본문 영역 DOM을 캡처해 다운로드합니다. (클라이언트 전용)
 */
export async function downloadParkingHistoryPdf(
  element: HTMLElement,
  project: Pick<Project, "org_name" | "manager" | "start_date" | "end_date">
): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: -window.scrollY,
    /** 전체 문서 크기로 캡처하면 느려질 수 있어 요소 기준만 사용 */
  });

  const imgData = canvas.toDataURL("image/png", 1.0);
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  /** 상단 여백 넉넉히, 하단 여백은 짧게 */
  const marginTopMm = 14;
  const marginBottomMm = 5;
  const marginX = 10;
  const sliceHeight = pageHeight - marginTopMm - marginBottomMm;

  const imgWidth = pageWidth - marginX * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = marginTopMm;

  pdf.addImage(imgData, "PNG", marginX, position, imgWidth, imgHeight);
  heightLeft -= sliceHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + marginTopMm;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", marginX, position, imgWidth, imgHeight);
    heightLeft -= sliceHeight;
  }

  pdf.save(buildParkingHistoryPdfFilename(project));
}
