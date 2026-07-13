// 담당자별 설문 스냅샷 생성·조회 (상단 이미지는 캠페인 참조로 용량 절약)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import {
  fetchSurveyCampaignHeaderImage,
  fetchSurveyCampaignSettings,
} from "@/lib/survey/survey-campaign-settings";
import { fetchSurveyQuestions } from "@/lib/survey/survey-questions";
import { fetchSurveyQuestionTemplateById } from "@/lib/survey/survey-question-templates";
import {
  fetchSurveyInviteByToken,
  invalidateSurveyInvitesCache,
} from "@/lib/survey/survey-invites";
import type {
  SurveyCampaignSettings,
  SurveyFormSnapshot,
  SurveyQuestion,
  SurveyQuestionTemplate,
  SurveyQuestionType,
} from "@/lib/survey/types";

export function parseSurveyFormSnapshot(raw: unknown): SurveyFormSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as SurveyFormSnapshot;
  if (o.version !== 1 || !Array.isArray(o.questions)) return null;
  return o;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** 초대 토큰·순서 기준 고정 ID — 재동결·페이지 유지 시 응답 ID 불일치 방지 */
export function stableSnapshotQuestionId(inviteToken: string, sortOrder: number): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  let h3 = 0x811c9dc5;
  const seed = `${inviteToken}\0${sortOrder}`;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + sortOrder + 1), 0x01000193);
    h3 = Math.imul(h3 ^ (c * 31 + i), 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(h3);
  const variant = `${((parseInt(b.slice(0, 2), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${b.slice(2, 4)}`;
  return `${a.slice(0, 8)}-${a.slice(0, 4)}-4${b.slice(0, 3)}-${variant}-${c.slice(0, 8)}${b.slice(4, 8)}${a.slice(4, 8)}`;
}

/** DB에 저장된 잘못된 UUID 스냅샷 ID를 토큰·순서 기준 ID로 교정 */
export function repairSnapshotQuestionIds(
  snapshot: SurveyFormSnapshot,
  inviteToken: string
): SurveyFormSnapshot {
  let changed = false;
  const questions = snapshot.questions.map((q, i) => {
    const order = q.sortOrder ?? i;
    const fixedId = stableSnapshotQuestionId(inviteToken, order);
    if (q.id === fixedId) return q;
    if (isValidUuid(q.id)) return q;
    changed = true;
    return { ...q, id: fixedId };
  });
  return changed ? { ...snapshot, questions } : snapshot;
}

function preserveSnapshotQuestionIds(
  existing: SurveyFormSnapshot | null | undefined,
  next: SurveyFormSnapshot
): SurveyFormSnapshot {
  if (!existing?.questions?.length) return next;
  return {
    ...next,
    questions: next.questions.map((q, i) => {
      const existingId = existing.questions[i]?.id;
      return {
        ...q,
        id: existingId && isValidUuid(existingId) ? existingId : q.id,
      };
    }),
  };
}

export function snapshotQuestionsToSurveyQuestions(
  snapshot: SurveyFormSnapshot,
  campaignKey: string
): SurveyQuestion[] {
  return snapshot.questions.map((q) => ({
    id: q.id,
    campaignKey,
    sortOrder: q.sortOrder,
    questionType: q.questionType,
    title: q.title,
    required: q.required,
    scaleMinLabel: q.scaleMinLabel,
    scaleMaxLabel: q.scaleMaxLabel,
    gridRows: q.gridRows,
  }));
}

export async function buildSurveyFormSnapshot(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<SurveyFormSnapshot> {
  if (isDevMode()) {
    const settings = devSurveyStore.getCampaignSettings(campaignKey);
    const questions = devSurveyStore.getQuestions(campaignKey);
    return {
      version: 1,
      frozenAt: new Date().toISOString(),
      title: settings.title,
      introText: settings.introText,
      useCampaignHeader: Boolean(settings.headerImageUrl),
      questions: questions.map((q, i) => ({
        id: q.id,
        sortOrder: i,
        questionType: q.questionType,
        title: q.title,
        required: q.required,
        scaleMinLabel: q.scaleMinLabel,
        scaleMaxLabel: q.scaleMaxLabel,
        gridRows: q.gridRows,
      })),
    };
  }

  const [settings, questions, header] = await Promise.all([
    fetchSurveyCampaignSettings(supabase, campaignKey, { includeHeader: false }),
    fetchSurveyQuestions(supabase, campaignKey),
    fetchSurveyCampaignHeaderImage(supabase, campaignKey),
  ]);

  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    title: settings.title,
    introText: settings.introText,
    useCampaignHeader: Boolean(header),
    questions: questions.map((q, i) => ({
      id: q.id,
      sortOrder: i,
      questionType: q.questionType as SurveyQuestionType,
      title: q.title,
      required: q.required,
      scaleMinLabel: q.scaleMinLabel,
      scaleMaxLabel: q.scaleMaxLabel,
      gridRows: q.gridRows,
    })),
  };
}

export async function buildSurveyFormSnapshotFromTemplate(
  supabase: SupabaseClient,
  campaignKey: string,
  template: SurveyQuestionTemplate,
  inviteToken: string
): Promise<SurveyFormSnapshot> {
  let useCampaignHeader = false;
  let templateHeaderImageUrl: string | null = null;

  if (template.headerImageUrl) {
    templateHeaderImageUrl = template.headerImageUrl;
  } else if (isDevMode()) {
    const settings = devSurveyStore.getCampaignSettings(campaignKey);
    useCampaignHeader = Boolean(settings.headerImageUrl);
  } else {
    const header = await fetchSurveyCampaignHeaderImage(supabase, campaignKey);
    useCampaignHeader = Boolean(header);
  }

  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    title: template.title,
    introText: template.introText,
    useCampaignHeader,
    templateHeaderImageUrl,
    templateId: template.id,
    templateName: template.name,
    questions: template.questions.map((q, i) => ({
      id: stableSnapshotQuestionId(inviteToken, i),
      sortOrder: i,
      questionType: q.questionType,
      title: q.title,
      required: q.required,
      scaleMinLabel: q.scaleMinLabel,
      scaleMaxLabel: q.scaleMaxLabel,
      gridRows: q.gridRows ?? [],
    })),
  };
}

export async function resolveSnapshotCampaignSettings(
  supabase: SupabaseClient,
  campaignKey: string,
  snapshot: SurveyFormSnapshot
): Promise<Pick<SurveyCampaignSettings, "title" | "introText" | "headerImageUrl">> {
  let headerImageUrl: string | null = null;
  if (snapshot.templateHeaderImageUrl) {
    headerImageUrl = snapshot.templateHeaderImageUrl;
  } else if (snapshot.useCampaignHeader) {
    headerImageUrl = await fetchSurveyCampaignHeaderImage(supabase, campaignKey);
  }
  return {
    title: snapshot.title,
    introText: snapshot.introText,
    headerImageUrl,
  };
}

export type FreezeInviteSnapshotOptions = {
  /** 지정 시 해당 질문 템플릿으로 스냅샷 고정 (미지정 시 캠페인 현재 질문) */
  templateId?: string;
};

/** 문자 발송 직전·미제출 초대에 설문 스냅샷 고정 */
export async function freezeInviteSnapshot(
  supabase: SupabaseClient,
  token: string,
  options?: FreezeInviteSnapshotOptions
): Promise<SurveyFormSnapshot> {
  const resolveSnapshot = async (
    campaignKey: string,
    existingSnapshot: SurveyFormSnapshot | null | undefined
  ): Promise<SurveyFormSnapshot> => {
    let snapshot: SurveyFormSnapshot;
    if (options?.templateId) {
      const template = await fetchSurveyQuestionTemplateById(supabase, options.templateId);
      if (!template) throw new Error("설문 템플릿을 찾을 수 없습니다.");
      snapshot = await buildSurveyFormSnapshotFromTemplate(
        supabase,
        campaignKey,
        template,
        token
      );
    } else {
      snapshot = await buildSurveyFormSnapshot(supabase, campaignKey);
    }
    return preserveSnapshotQuestionIds(existingSnapshot, snapshot);
  };

  if (isDevMode()) {
    const invite = devSurveyStore.getInviteByToken(token);
    if (!invite) throw new Error("유효하지 않은 설문 링크입니다.");
    if (invite.submittedAt && invite.formSnapshot) return invite.formSnapshot;
    const snapshot = await resolveSnapshot(invite.campaignKey, invite.formSnapshot);
    devSurveyStore.setInviteSnapshot(token, snapshot);
    return snapshot;
  }

  const invite = await fetchSurveyInviteByToken(supabase, token);
  if (!invite) throw new Error("유효하지 않은 설문 링크입니다.");
  if (invite.submittedAt) {
    if (invite.formSnapshot) return invite.formSnapshot;
    throw new Error("제출된 설문에 스냅샷이 없습니다.");
  }

  const snapshot = await resolveSnapshot(invite.campaignKey, invite.formSnapshot);
  const { error } = await supabase
    .from("survey_invites")
    .update({ form_snapshot: snapshot })
    .eq("token", token)
    .is("submitted_at", null);

  if (error) throw new Error(error.message);
  invalidateSurveyInvitesCache(invite.campaignKey);
  return snapshot;
}

export async function getInviteDisplayForm(
  supabase: SupabaseClient,
  invite: {
    token: string;
    campaignKey: string;
    submittedAt: string | null;
    formSnapshot?: SurveyFormSnapshot | null;
  }
): Promise<{
  settings: Pick<SurveyCampaignSettings, "title" | "introText" | "headerImageUrl">;
  questions: SurveyQuestion[];
}> {
  if (invite.formSnapshot) {
    const snapshot = repairSnapshotQuestionIds(invite.formSnapshot, invite.token);
    return {
      settings: await resolveSnapshotCampaignSettings(
        supabase,
        invite.campaignKey,
        snapshot
      ),
      questions: snapshotQuestionsToSurveyQuestions(snapshot, invite.campaignKey),
    };
  }

  const [settings, questions] = await Promise.all([
    fetchSurveyCampaignSettings(supabase, invite.campaignKey),
    fetchSurveyQuestions(supabase, invite.campaignKey),
  ]);

  return { settings, questions };
}

/** 발송 전 미리보기 — DB 스냅샷 저장 없이 선택 템플릿으로 폼 구성 */
export async function getInvitePreviewForm(
  supabase: SupabaseClient,
  invite: { token: string; campaignKey: string },
  templateId: string
): Promise<{
  settings: Pick<SurveyCampaignSettings, "title" | "introText" | "headerImageUrl">;
  questions: SurveyQuestion[];
}> {
  const template = await fetchSurveyQuestionTemplateById(supabase, templateId);
  if (!template) throw new Error("설문 템플릿을 찾을 수 없습니다.");

  const snapshot = await buildSurveyFormSnapshotFromTemplate(
    supabase,
    invite.campaignKey,
    template,
    invite.token
  );

  return {
    settings: await resolveSnapshotCampaignSettings(supabase, invite.campaignKey, snapshot),
    questions: snapshotQuestionsToSurveyQuestions(snapshot, invite.campaignKey),
  };
}
