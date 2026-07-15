// 설문 공개 API — 토큰으로 질문 조회·1회 제출
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getInviteDisplayForm, getInvitePreviewForm } from "@/lib/survey/survey-form-snapshot";
import { fetchSurveyCampaignCompletionMessage } from "@/lib/survey/survey-campaign-settings";
import { fetchSurveyInviteByToken } from "@/lib/survey/survey-invites";
import { submitSurveyAnswers } from "@/lib/survey/survey-responses";
import type { SurveyAnswerInput } from "@/lib/survey/types";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get("preview") === "1";
  const templateId = searchParams.get("templateId")?.trim() ?? "";

  const supabase = getSupabase();
  const invite = await fetchSurveyInviteByToken(supabase, token);
  if (!invite) {
    return NextResponse.json({ error: "유효하지 않은 설문 링크입니다." }, { status: 404 });
  }

  if (!invite.submittedAt && isPreview && templateId) {
    try {
      const { settings, questions } = await getInvitePreviewForm(supabase, invite, templateId);
      return NextResponse.json(
        {
          preview: true,
          submitted: false,
          settings: {
            title: settings.title,
            introText: settings.introText,
            headerImageUrl: settings.headerImageUrl,
            completionMessage: await fetchSurveyCampaignCompletionMessage(
              supabase,
              invite.campaignKey
            ),
          },
          questions: questions.map((q) => ({
            id: q.id,
            questionType: q.questionType,
            title: q.title,
            required: q.required,
            scaleMinLabel: q.scaleMinLabel,
            scaleMaxLabel: q.scaleMaxLabel,
            gridRows: q.gridRows,
          })),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "미리보기를 불러올 수 없습니다.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const { settings, questions } = await getInviteDisplayForm(supabase, invite);
  const completionMessage = await fetchSurveyCampaignCompletionMessage(
    supabase,
    invite.campaignKey
  );
  const settingsPayload = {
    title: settings.title,
    introText: settings.introText,
    headerImageUrl: settings.headerImageUrl,
    completionMessage,
  };

  if (invite.submittedAt) {
    return NextResponse.json(
      { submitted: true, questions: [], settings: settingsPayload },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!invite.formSnapshot) {
    return NextResponse.json(
      { error: "설문이 아직 준비되지 않았습니다. 발송된 링크로 다시 접속해 주세요." },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      submitted: false,
      settings: settingsPayload,
      questions: questions.map((q) => ({
        id: q.id,
        questionType: q.questionType,
        title: q.title,
        required: q.required,
        scaleMinLabel: q.scaleMinLabel,
        scaleMaxLabel: q.scaleMaxLabel,
        gridRows: q.gridRows,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  let body: { answers?: SurveyAnswerInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const answers = body.answers;
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: "answers 배열이 필요합니다." }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    await submitSurveyAnswers(supabase, token, answers);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "제출에 실패했습니다.";
    const status = message.includes("이미 제출") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
