// 초대 링크에 선택 템플릿 스냅샷을 서버에서 고정 (클라이언트 isDevMode 우회)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { freezeInviteSnapshot } from "@/lib/survey/survey-form-snapshot";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
  }

  let body: { templateId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const templateId = body.templateId?.trim() ?? "";
  if (!templateId) {
    return NextResponse.json({ error: "설문 템플릿을 선택해 주세요." }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    const snapshot = await freezeInviteSnapshot(supabase, token, {
      templateId,
      forceDatabase: true,
    });
    return NextResponse.json(
      {
        ok: true,
        templateId: snapshot.templateId ?? templateId,
        templateName: snapshot.templateName ?? null,
        frozenAt: snapshot.frozenAt,
        questionCount: snapshot.questions.length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "설문 템플릿 반영에 실패했습니다.";
    const status = message.includes("유효하지 않은")
      ? 404
      : message.includes("제출된")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
