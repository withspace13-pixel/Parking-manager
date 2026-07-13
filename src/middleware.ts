// 설문 전용 도메인에서는 /survey 경로만 허용
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function parseSurveyHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return trimmed.includes("://")
      ? new URL(trimmed).host.split(":")[0].toLowerCase()
      : trimmed.split(":")[0].toLowerCase();
  } catch {
    return null;
  }
}

/** 요청마다 읽어야 Vercel env 변경·런타임 변수가 반영됩니다 */
function surveyPublicHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [
    process.env.SURVEY_ONLY_HOST,
    process.env.NEXT_PUBLIC_SURVEY_PUBLIC_URL,
  ]) {
    const host = raw ? parseSurveyHost(raw) : null;
    if (host) hosts.add(host);
  }
  return hosts;
}

function isSurveyOnlyHost(hostHeader: string | null): boolean {
  const hosts = surveyPublicHosts();
  if (hosts.size === 0 || !hostHeader) return false;
  const host = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  return hosts.has(host);
}

function isAllowedOnSurveyHost(pathname: string): boolean {
  return (
    pathname.startsWith("/survey") ||
    pathname.startsWith("/api/survey") ||
    pathname.startsWith("/_next")
  );
}

export function middleware(request: NextRequest) {
  if (!isSurveyOnlyHost(request.headers.get("host"))) {
    return NextResponse.next();
  }

  if (isAllowedOnSurveyHost(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return new NextResponse("Not Found", { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
