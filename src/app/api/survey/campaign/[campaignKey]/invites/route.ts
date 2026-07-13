// 만족도 설문 응답 관리용 — 스냅샷 이미지 제외 후 초대·답변 목록
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import { stripFormSnapshotImages } from "@/lib/survey/survey-form-snapshot";
import { fetchSurveyInvitesWithAnswers } from "@/lib/survey/survey-invites";

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

export async function GET(
  _request: Request,
  { params }: { params: { campaignKey: string } }
) {
  const campaignKey = decodeURIComponent(params.campaignKey ?? "").trim();
  if (!campaignKey) {
    return NextResponse.json({ error: "campaignKey가 필요합니다." }, { status: 400 });
  }

  try {
    if (isDevMode()) {
      const invites = devSurveyStore.getInvitesByCampaign(campaignKey).map((invite) => ({
        ...invite,
        formSnapshot: stripFormSnapshotImages(invite.formSnapshot) ?? invite.formSnapshot,
        answers: devSurveyStore.getAnswersByInvite(invite.token).map((a) => ({
          questionId: a.questionId,
          rowKey: a.rowKey ?? null,
          value: a.value,
        })),
      }));
      return NextResponse.json({ invites });
    }

    const supabase = getSupabase();
    const invites = await fetchSurveyInvitesWithAnswers(supabase, campaignKey, {
      omitSnapshotImages: true,
    });
    return NextResponse.json({ invites });
  } catch (err) {
    const message = err instanceof Error ? err.message : "설문 응답 목록을 불러올 수 없습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
