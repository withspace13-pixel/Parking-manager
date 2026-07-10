// 만족도 설문 요약 PDF 다운로드 (여러 페이지 자동 분할)
import { sanitizeFilename } from "@/lib/parking-history-pdf";
import { formatSurveyCampaignMonthLabel } from "@/lib/survey-messaging";

export function buildSurveySummaryPdfFilename(campaignKey: string): string {
  const monthLabel = formatSurveyCampaignMonthLabel(campaignKey);
  return sanitizeFilename(`만족도조사_요약_${monthLabel}.pdf`);
}

export async function downloadSurveySummaryPdf(
  element: HTMLElement,
  campaignKey: string
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
  });

  const imgData = canvas.toDataURL("image/png", 1.0);
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
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

  pdf.save(buildSurveySummaryPdfFilename(campaignKey));
}
