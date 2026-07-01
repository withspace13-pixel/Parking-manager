// 솔라피 연동 상태 확인 API
import { NextResponse } from "next/server";
import { isSolapiConfigured } from "@/lib/solapi-server";

export async function GET() {
  return NextResponse.json({ configured: isSolapiConfigured() });
}
