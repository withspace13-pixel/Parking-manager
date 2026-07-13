// 만족도 설문 담당자별 초대 토큰 (Supabase + 세션 캐시)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import type { SurveyInvite, SurveyFormSnapshot } from "@/lib/survey/types";
import { parseSurveyFormSnapshot, stripFormSnapshotImages } from "@/lib/survey/survey-form-snapshot";

type InviteRow = {
  token: string;
  campaign_key: string;
  recipient_id: string;
  manager_name: string;
  org_name: string;
  submitted_at: string | null;
  created_at: string;
  form_snapshot?: unknown;
};

const INVITE_SELECT =
  "token, campaign_key, recipient_id, manager_name, org_name, submitted_at, created_at, form_snapshot";

const INVITE_SELECT_LIGHT =
  "token, campaign_key, recipient_id, manager_name, org_name, submitted_at, created_at";

const campaignCache = new Map<string, Map<string, SurveyInvite>>();
const campaignFetchPromises = new Map<string, Promise<Map<string, SurveyInvite>>>();
const ensureAllChains = new Map<string, Promise<Map<string, SurveyInvite>>>();

export type FetchSurveyInvitesOptions = {
  /** 관리 화면용 — templateHeaderImageUrl(base64) 제거 */
  omitSnapshotImages?: boolean;
};

function rowToInvite(row: InviteRow, options?: FetchSurveyInvitesOptions): SurveyInvite {
  let formSnapshot = parseSurveyFormSnapshot(row.form_snapshot);
  if (options?.omitSnapshotImages) {
    formSnapshot = stripFormSnapshotImages(formSnapshot) ?? null;
  }
  return {
    token: row.token,
    campaignKey: row.campaign_key,
    recipientId: row.recipient_id,
    managerName: row.manager_name,
    orgName: row.org_name,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    formSnapshot,
  };
}

function token(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `t${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}

function isUniqueViolation(error: { code?: string; status?: number; message?: string }): boolean {
  return (
    error.code === "23505" ||
    error.status === 409 ||
    /duplicate key/i.test(error.message ?? "")
  );
}

function cacheInvite(campaignKey: string, invite: SurveyInvite) {
  const map = campaignCache.get(campaignKey) ?? new Map<string, SurveyInvite>();
  map.set(invite.recipientId, invite);
  campaignCache.set(campaignKey, map);
}

function pickInvites(
  map: Map<string, SurveyInvite>,
  recipients: Array<{ id: string }>
): Map<string, SurveyInvite> {
  const out = new Map<string, SurveyInvite>();
  for (const r of recipients) {
    const invite = map.get(r.id);
    if (invite) out.set(r.id, invite);
  }
  return out;
}

export function invalidateSurveyInvitesCache(campaignKey?: string) {
  if (campaignKey) {
    campaignCache.delete(campaignKey);
    campaignFetchPromises.delete(campaignKey);
  } else {
    campaignCache.clear();
    campaignFetchPromises.clear();
  }
}

async function loadCampaignInvitesLight(
  supabase: SupabaseClient,
  campaignKey: string,
  force = false
): Promise<Map<string, SurveyInvite>> {
  if (!force) {
    const cached = campaignCache.get(campaignKey);
    if (cached) return cached;
  }

  const { data, error } = await supabase
    .from("survey_invites")
    .select(INVITE_SELECT_LIGHT)
    .eq("campaign_key", campaignKey);

  if (error) {
    console.warn("[survey_invites fetch]", error.message);
    return campaignCache.get(campaignKey) ?? new Map();
  }

  const map = new Map<string, SurveyInvite>();
  for (const row of data ?? []) {
    const invite = rowToInvite(row as InviteRow);
    map.set(invite.recipientId, invite);
  }
  campaignCache.set(campaignKey, map);
  return map;
}

async function loadCampaignInvitesWithSnapshots(
  supabase: SupabaseClient,
  campaignKey: string,
  options?: FetchSurveyInvitesOptions
): Promise<Map<string, SurveyInvite>> {
  const { data, error } = await supabase
    .from("survey_invites")
    .select(INVITE_SELECT)
    .eq("campaign_key", campaignKey);

  if (error) {
    console.warn("[survey_invites fetch snapshots]", error.message);
    return campaignCache.get(campaignKey) ?? new Map();
  }

  const map = new Map<string, SurveyInvite>();
  for (const row of data ?? []) {
    const invite = rowToInvite(row as InviteRow, options);
    map.set(invite.recipientId, invite);
  }
  return map;
}

export type SurveyInviteWithAnswers = SurveyInvite & {
  answers: Array<{ questionId: string; rowKey: string | null; value: string }>;
  formSnapshot?: SurveyFormSnapshot | null;
};

async function fetchSurveyAnswersByTokens(
  supabase: SupabaseClient,
  tokens: string[]
): Promise<Map<string, SurveyInviteWithAnswers["answers"]>> {
  if (tokens.length === 0) return new Map();

  const { data: answerRows, error } = await supabase
    .from("survey_answers")
    .select("invite_token, question_id, row_key, answer_value")
    .in("invite_token", tokens);

  if (error) {
    console.warn("[survey_answers fetch]", error.message);
    return new Map();
  }

  const byToken = new Map<string, SurveyInviteWithAnswers["answers"]>();
  for (const row of answerRows ?? []) {
    const list = byToken.get(row.invite_token as string) ?? [];
    list.push({
      questionId: row.question_id as string,
      rowKey: (row.row_key as string | null) ?? null,
      value: row.answer_value as string,
    });
    byToken.set(row.invite_token as string, list);
  }
  return byToken;
}

export async function fetchSurveyInvitesByCampaign(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<Map<string, SurveyInvite>> {
  if (isDevMode()) {
    const map = new Map<string, SurveyInvite>();
    for (const i of devSurveyStore.getInvitesByCampaign(campaignKey)) {
      map.set(i.recipientId, i);
    }
    return map;
  }
  const cached = campaignCache.get(campaignKey);
  if (cached) return cached;
  const pending = campaignFetchPromises.get(campaignKey);
  if (pending) return pending;
  const promise = loadCampaignInvitesLight(supabase, campaignKey).finally(() => {
    campaignFetchPromises.delete(campaignKey);
  });
  campaignFetchPromises.set(campaignKey, promise);
  return promise;
}

export async function ensureSurveyInvitesForRecipients(
  supabase: SupabaseClient,
  campaignKey: string,
  recipients: Array<{ id: string; managerName: string; orgName: string }>
): Promise<Map<string, SurveyInvite>> {
  const deduped = new Map<string, { id: string; managerName: string; orgName: string }>();
  for (const r of recipients) {
    if (!r.id) continue;
    deduped.set(r.id, r);
  }
  const list = Array.from(deduped.values());
  if (list.length === 0) return new Map();

  if (isDevMode()) {
    for (const r of list) {
      devSurveyStore.ensureInvite({
        campaignKey,
        recipientId: r.id,
        managerName: r.managerName,
        orgName: r.orgName,
      });
    }
    return pickInvites(await fetchSurveyInvitesByCampaign(supabase, campaignKey), list);
  }

  const prev = ensureAllChains.get(campaignKey) ?? Promise.resolve(new Map<string, SurveyInvite>());
  const next = prev
    .catch(() => new Map<string, SurveyInvite>())
    .then(async () => {
      let map = await fetchSurveyInvitesByCampaign(supabase, campaignKey);
      const missing = list.filter((r) => !map.has(r.id));
      if (missing.length === 0) {
        return pickInvites(map, list);
      }

      let inserted = false;
      for (const r of missing) {
        const newToken = token();
        const { error } = await supabase.from("survey_invites").insert({
          token: newToken,
          campaign_key: campaignKey,
          recipient_id: r.id,
          manager_name: r.managerName,
          org_name: r.orgName,
        });
        if (!error) {
          inserted = true;
          cacheInvite(campaignKey, {
            token: newToken,
            campaignKey,
            recipientId: r.id,
            managerName: r.managerName,
            orgName: r.orgName,
            submittedAt: null,
          });
          continue;
        }
        if (!isUniqueViolation(error)) {
          throw new Error(error.message);
        }
        inserted = true;
      }

      if (inserted) {
        invalidateSurveyInvitesCache(campaignKey);
        map = await loadCampaignInvitesLight(supabase, campaignKey, true);
      }

      return pickInvites(map, list);
    });

  ensureAllChains.set(campaignKey, next);
  try {
    return await next;
  } finally {
    if (ensureAllChains.get(campaignKey) === next) {
      ensureAllChains.delete(campaignKey);
    }
  }
}

export async function ensureSurveyInvite(
  supabase: SupabaseClient,
  input: {
    campaignKey: string;
    recipientId: string;
    managerName: string;
    orgName: string;
  }
): Promise<SurveyInvite> {
  const map = await ensureSurveyInvitesForRecipients(supabase, input.campaignKey, [
    {
      id: input.recipientId,
      managerName: input.managerName,
      orgName: input.orgName,
    },
  ]);
  const invite = map.get(input.recipientId);
  if (!invite) throw new Error("설문 링크를 만들지 못했습니다.");
  return invite;
}

export async function fetchSurveyInviteByToken(
  supabase: SupabaseClient,
  inviteToken: string
): Promise<SurveyInvite | null> {
  if (isDevMode()) {
    return devSurveyStore.getInviteByToken(inviteToken);
  }
  const { data, error } = await supabase
    .from("survey_invites")
    .select(INVITE_SELECT)
    .eq("token", inviteToken)
    .maybeSingle();
  if (error || !data) return null;
  return rowToInvite(data as InviteRow);
}

export async function fetchSurveyInvitesWithAnswers(
  supabase: SupabaseClient,
  campaignKey: string,
  options?: FetchSurveyInvitesOptions
): Promise<SurveyInviteWithAnswers[]> {
  if (isDevMode()) {
    return devSurveyStore.getInvitesByCampaign(campaignKey).map((invite) => ({
      ...invite,
      formSnapshot: stripFormSnapshotImages(invite.formSnapshot) ?? invite.formSnapshot,
      answers: devSurveyStore.getAnswersByInvite(invite.token).map((a) => ({
        questionId: a.questionId,
        rowKey: a.rowKey ?? null,
        value: a.value,
      })),
    }));
  }

  const invites = Array.from(
    (await loadCampaignInvitesWithSnapshots(supabase, campaignKey, options)).values()
  );
  if (invites.length === 0) return [];

  const byToken = await fetchSurveyAnswersByTokens(
    supabase,
    invites.map((i) => i.token)
  );

  return invites.map((invite) => ({
    ...invite,
    answers: byToken.get(invite.token) ?? [],
  }));
}

/** 응답·요약 관리 화면 — 서버에서 이미지 제거 후 전달 */
export async function fetchSurveyInvitesWithAnswersForAdmin(
  campaignKey: string
): Promise<SurveyInviteWithAnswers[]> {
  const res = await fetch(
    `/api/survey/campaign/${encodeURIComponent(campaignKey)}/invites`,
    { cache: "no-store" }
  );
  const data = (await res.json().catch(() => ({}))) as {
    invites?: SurveyInviteWithAnswers[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "설문 응답 목록을 불러올 수 없습니다.");
  }
  return data.invites ?? [];
}
