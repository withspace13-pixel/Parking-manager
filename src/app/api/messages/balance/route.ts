// 솔라피 충전 잔액 조회 API
import { NextResponse } from "next/server";
import { fetchSolapiBalance, isSolapiConfigured } from "@/lib/solapi-server";

export async function GET() {
  if (!isSolapiConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const { balance, point } = await fetchSolapiBalance();
    return NextResponse.json({ configured: true, balance, point });
  } catch (err) {
    const message = err instanceof Error ? err.message : "잔액 조회에 실패했습니다.";
    return NextResponse.json({ configured: true, error: message }, { status: 502 });
  }
}
