// 설문 응답 불일치 상태 정리 (레거시 데이터용)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import {
  fetchSurveyInvitesWithAnswers,
  invalidateSurveyInvitesCache,
} from "@/lib/survey/survey-invites";

/** 제출 표시(submitted_at)는 있는데 응답 행이 없는 초대 */
export async function reconcileStaleSurveySubmissions(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<number> {
  if (isDevMode()) {
    return devSurveyStore.reconcileStaleSubmissions(campaignKey);
  }

  const invites = await fetchSurveyInvitesWithAnswers(supabase, campaignKey);
  const stale = invites.filter((inv) => inv.submittedAt && inv.answers.length === 0);
  if (stale.length === 0) return 0;

  const { error } = await supabase
    .from("survey_invites")
    .update({ submitted_at: null })
    .in(
      "token",
      stale.map((inv) => inv.token)
    );

  if (error) throw new Error(error.message);
  invalidateSurveyInvitesCache(campaignKey);
  return stale.length;
}
