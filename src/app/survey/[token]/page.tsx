// 담당자용 공개 만족도 설문 페이지
import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { fetchSurveyInviteByToken } from "@/lib/survey/survey-invites";
import { getInviteDisplayForm } from "@/lib/survey/survey-form-snapshot";
import { resolveSurveyPageTitle } from "@/lib/survey/survey-page-title";
import { SurveyFormClient } from "./SurveyFormClient";

type Props = {
  params: { token: string };
};

function getServerSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const supabase = getServerSupabase();
    const invite = await fetchSurveyInviteByToken(supabase, params.token);
    if (!invite) {
      return { title: "만족도 설문", description: "위드스페이스 만족도 조사" };
    }
    const settings = (await getInviteDisplayForm(supabase, invite)).settings;
    const title = resolveSurveyPageTitle(settings.title);
    return { title, description: title };
  } catch {
    return { title: "만족도 설문", description: "위드스페이스 만족도 조사" };
  }
}

export default function SurveyPublicPage({ params }: Props) {
  const { token } = params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f0ebe3] p-6">
          <p className="text-[var(--text-muted)]">설문을 불러오는 중...</p>
        </div>
      }
    >
      <SurveyFormClient key={token} token={token} />
    </Suspense>
  );
}
