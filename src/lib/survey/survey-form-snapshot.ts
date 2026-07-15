// 담당자별 설문 스냅샷 생성·조회 (상단 이미지는 캠페인 참조로 용량 절약)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import {
  fetchSurveyCampaignHeaderImage,
  fetchSurveyCampaignSettings,
} from "@/lib/survey/survey-campaign-settings";
import { fetchSurveySharedHeaderImage } from "@/lib/survey/survey-shared-settings";
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

/** 관리 화면 조회용 — 스냅샷에서 base64 상단 이미지 제거 */
export function stripFormSnapshotImages(
  snapshot: SurveyFormSnapshot | null | undefined
): SurveyFormSnapshot | null | undefined {
  if (!snapshot || snapshot.templateHeaderImageUrl == null) return snapshot;
  const { templateHeaderImageUrl: _removed, ...rest } = snapshot;
  return rest;
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
  let h4 = 0x811c9dc5;
  const seed = `${inviteToken}\0${sortOrder}`;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + sortOrder + 1), 0x01000193);
    h3 = Math.imul(h3 ^ (c * 31 + i), 0x01000193);
    h4 = Math.imul(h4 ^ (c * 17 + sortOrder), 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const raw = `${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`;
  const timeLow = raw.slice(0, 8);
  const timeMid = raw.slice(8, 12);
  const timeHi = `4${raw.slice(13, 16)}`;
  const clockSeq = `${((parseInt(raw[16]!, 16) & 0x3) | 0x8).toString(16)}${raw.slice(17, 20)}`;
  const node = raw.slice(20, 32);
  const id = `${timeLow}-${timeMid}-${timeHi}-${clockSeq}-${node}`;
  if (!isValidUuid(id)) {
    throw new Error("stableSnapshotQuestionId: invalid UUID generated");
  }
  return id;
}

/** DB에 저장된 잘못된 UUID 스냅샷 ID를 토큰·순서 기준 ID로 교정 */
export function repairSnapshotQuestionIds(
  snapshot: SurveyFormSnapshot,
  inviteToken: string
): SurveyFormSnapshot {
  const needsStableIds =
    Boolean(snapshot.templateId) || snapshot.questions.some((q) => !isValidUuid(q.id));
  if (!needsStableIds) return snapshot;

  let changed = false;
  const questions = snapshot.questions.map((q, i) => {
    const order = q.sortOrder ?? i;
    const fixedId = stableSnapshotQuestionId(inviteToken, order);
    if (q.id === fixedId) return q;
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
    const shared = await fetchSurveySharedHeaderImage(supabase);
    return {
      version: 1,
      frozenAt: new Date().toISOString(),
      title: settings.title,
      introText: settings.introText,
      useCampaignHeader: Boolean(shared || settings.headerImageUrl),
      templateHeaderImageUrl: null,
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

  const [settings, questions, sharedHeader, header] = await Promise.all([
    fetchSurveyCampaignSettings(supabase, campaignKey, { includeHeader: false }),
    fetchSurveyQuestions(supabase, campaignKey),
    fetchSurveySharedHeaderImage(supabase),
    fetchSurveyCampaignHeaderImage(supabase, campaignKey),
  ]);

  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    title: settings.title,
    introText: settings.introText,
    useCampaignHeader: Boolean(sharedHeader || header),
    templateHeaderImageUrl: null,
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
  // 상단 이미지는 전역 공유 — 스냅샷에 base64를 넣지 않음
  let useCampaignHeader = false;
  if (isDevMode()) {
    const shared = await fetchSurveySharedHeaderImage(supabase);
    const settings = devSurveyStore.getCampaignSettings(campaignKey);
    useCampaignHeader = Boolean(shared || settings.headerImageUrl);
  } else {
    const shared = await fetchSurveySharedHeaderImage(supabase);
    if (shared) {
      useCampaignHeader = true;
    } else {
      const header = await fetchSurveyCampaignHeaderImage(supabase, campaignKey);
      useCampaignHeader = Boolean(header);
    }
  }

  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    title: template.title,
    introText: template.introText,
    useCampaignHeader,
    templateHeaderImageUrl: null,
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
  // 신규 스냅샷의 임베드 이미지는 호환용으로만 사용. 신규 고정은 전역·캠페인 참조.
  if (snapshot.useCampaignHeader) {
    headerImageUrl =
      (await fetchSurveySharedHeaderImage(supabase)) ??
      (await fetchSurveyCampaignHeaderImage(supabase, campaignKey));
  } else if (snapshot.templateHeaderImageUrl) {
    headerImageUrl = snapshot.templateHeaderImageUrl;
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
      const template = await fetchSurveyQuestionTemplateById(supabase, options.templateId, {
        force: true,
      });
      if (!template) throw new Error("설문 템플릿을 찾을 수 없습니다.");
      snapshot = await buildSurveyFormSnapshotFromTemplate(
        supabase,
        campaignKey,
        template,
        token
      );
      // 템플릿이 바뀌면 이전 스냅샷 ID를 이어서 쓰지 않음
      if (existingSnapshot?.templateId && existingSnapshot.templateId !== options.templateId) {
        return snapshot;
      }
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
    const idsChanged = snapshot.questions.some(
      (q, i) => q.id !== invite.formSnapshot!.questions[i]?.id
    );
    if (!invite.submittedAt && idsChanged) {
      const { error } = await supabase
        .from("survey_invites")
        .update({ form_snapshot: snapshot })
        .eq("token", invite.token)
        .is("submitted_at", null);
      if (!error) invalidateSurveyInvitesCache(invite.campaignKey);
    }
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
  const template = await fetchSurveyQuestionTemplateById(supabase, templateId, { force: true });
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
