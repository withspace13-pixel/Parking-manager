// 설문 공개 URL 생성
function configuredSurveyPublicBase(): string {
  return (process.env.NEXT_PUBLIC_SURVEY_PUBLIC_URL || "").replace(/\/+$/, "");
}

export function getSurveyPublicBaseUrl(): string {
  const configured = configuredSurveyPublicBase();
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
}

export function buildSurveyPublicUrl(token: string): string {
  const base = getSurveyPublicBaseUrl();
  return base ? `${base}/survey/${token}` : `/survey/${token}`;
}

/** 발송 전 관리자 미리보기 — 스냅샷 저장 없이 템플릿만 반영 (캐시 무력화) */
export function buildSurveyPreviewUrl(token: string, templateId: string): string {
  const base = buildSurveyPublicUrl(token);
  const params = new URLSearchParams({
    preview: "1",
    templateId,
    _: String(Date.now()),
  });
  return `${base}?${params.toString()}`;
}
