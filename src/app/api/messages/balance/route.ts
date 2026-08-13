// 솔라피 충전 잔액 조회 API
import { NextResponse } from "next/server";
import { fetchSolapiBalance, isSolapiConfigured } from "@/lib/solapi-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  if (!isSolapiConfigured()) {
    return NextResponse.json({ configured: false }, { headers: NO_STORE });
  }

  try {
    const { balance, point } = await fetchSolapiBalance();
    return NextResponse.json(
      { configured: true, balance, point, fetchedAt: Date.now() },
      { headers: NO_STORE }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "잔액 조회에 실패했습니다.";
    return NextResponse.json(
      { configured: true, error: message },
      { status: 502, headers: NO_STORE }
    );
  }
}
