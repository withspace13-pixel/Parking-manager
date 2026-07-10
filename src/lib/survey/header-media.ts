// 설문 상단 헤더 파일(JPEG·PNG·PDF) 읽기·표시 유틸
export const SURVEY_HEADER_ACCEPT = "image/jpeg,image/png,application/pdf";
export const SURVEY_HEADER_MAX_BYTES = 900_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);

export function surveyHeaderFileLabel(mime: string): string {
  if (mime === "image/jpeg") return "JPEG";
  if (mime === "image/png") return "PNG";
  if (mime === "application/pdf") return "PDF";
  return "파일";
}

export function isSurveyHeaderPdf(url: string): boolean {
  return url.startsWith("data:application/pdf") || /\.pdf($|\?)/i.test(url);
}

export function isSurveyHeaderImage(url: string): boolean {
  return url.startsWith("data:image/") || (!isSurveyHeaderPdf(url) && /^https?:\/\//i.test(url));
}

export function readSurveyHeaderFile(file: File): Promise<string> {
  const mime = file.type || guessMimeFromName(file.name);
  if (!mime || !ALLOWED_MIME.has(mime)) {
    return Promise.reject(new Error("JPEG, PNG, PDF 파일만 업로드할 수 있습니다."));
  }
  if (file.size > SURVEY_HEADER_MAX_BYTES) {
    return Promise.reject(
      new Error(`파일 크기는 ${Math.round(SURVEY_HEADER_MAX_BYTES / 1024)}KB 이하여야 합니다.`)
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

function guessMimeFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return null;
}
