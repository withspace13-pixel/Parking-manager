// 솔라피 문자 발송 API
import { NextResponse } from "next/server";
import { isSolapiConfigured, sendSmsViaSolapi } from "@/lib/solapi-server";

export async function POST(request: Request) {
  if (!isSolapiConfigured()) {
    return NextResponse.json(
      {
        error:
          "솔라피 API가 설정되지 않았습니다. .env.local에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER를 추가한 뒤 서버를 재시작해 주세요.",
      },
      { status: 503 }
    );
  }

  let body: { to?: string; text?: string };
  try {
    body = (await request.json()) as { to?: string; text?: string };
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const to = body.to?.trim();
  const text = body.text?.trim();
  if (!to || !text) {
    return NextResponse.json({ error: "수신번호와 문구를 입력해 주세요." }, { status: 400 });
  }

  try {
    const result = await sendSmsViaSolapi(to, text);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "문자 발송에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
