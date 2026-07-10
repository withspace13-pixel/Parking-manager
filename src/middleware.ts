// 설문 전용 도메인에서는 /survey 경로만 허용
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function surveyPublicHosts(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_SURVEY_PUBLIC_URL || "";
  if (!raw) return new Set();
  try {
    return new Set([new URL(raw).host.toLowerCase()]);
  } catch {
    return new Set();
  }
}

const SURVEY_HOSTS = surveyPublicHosts();

function isSurveyOnlyHost(hostHeader: string | null): boolean {
  if (SURVEY_HOSTS.size === 0 || !hostHeader) return false;
  const host = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  return SURVEY_HOSTS.has(host);
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
