// 솔라피 발송 상태 새로고침 API
import { NextResponse } from "next/server";
import { isSolapiConfigured, refreshSmsStatuses } from "@/lib/solapi-server";

export async function POST(request: Request) {
  if (!isSolapiConfigured()) {
    return NextResponse.json({ error: "솔라피 API가 설정되지 않았습니다." }, { status: 503 });
  }

  let body: { messageIds?: string[] };
  try {
    body = (await request.json()) as { messageIds?: string[] };
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const messageIds = body.messageIds?.filter((id) => typeof id === "string" && id.trim()) ?? [];
  if (messageIds.length === 0) {
    return NextResponse.json({ error: "messageIds가 필요합니다." }, { status: 400 });
  }

  try {
    const statuses = await refreshSmsStatuses(messageIds);
    return NextResponse.json({ ok: true, statuses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "상태 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
