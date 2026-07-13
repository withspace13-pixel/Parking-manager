// 개발자 모드 만족도 설문 로컬 저장소
import type {
  SurveyAnswer,
  SurveyCampaignSettings,
  SurveyInvite,
  SurveyQuestion,
  SurveyQuestionTemplate,
  SurveyQuestionTemplateItem,
} from "@/lib/survey/types";
import { DEFAULT_SURVEY_CAMPAIGN_TITLE, DEFAULT_SURVEY_COMPLETION_MESSAGE, DEFAULT_SURVEY_INTRO_TEXT } from "@/lib/survey/types";

const DEV_SURVEY_KEY = "parking-manager-survey-dev";

type DevSurveyData = {
  questions: Record<string, SurveyQuestion[]>;
  invites: SurveyInvite[];
  answers: SurveyAnswer[];
  settings: Record<string, SurveyCampaignSettings>;
  questionTemplates: SurveyQuestionTemplate[];
};

function empty(): DevSurveyData {
  return { questions: {}, invites: [], answers: [], settings: {}, questionTemplates: [] };
}

function load(): DevSurveyData {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(DEV_SURVEY_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as DevSurveyData;
    return {
      questions: parsed.questions ?? {},
      invites: parsed.invites ?? [],
      answers: parsed.answers ?? [],
      settings: parsed.settings ?? {},
      questionTemplates: parsed.questionTemplates ?? [],
    };
  } catch {
    return empty();
  }
}

function save(data: DevSurveyData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEV_SURVEY_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function token() {
  return uuid().replace(/-/g, "");
}

export const devSurveyStore = {
  getQuestions(campaignKey: string): SurveyQuestion[] {
    const data = load();
    return [...(data.questions[campaignKey] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  saveQuestions(campaignKey: string, questions: SurveyQuestion[]) {
    const data = load();
    data.questions[campaignKey] = questions;
    save(data);
  },

  getInvitesByCampaign(campaignKey: string): SurveyInvite[] {
    return load().invites.filter((i) => i.campaignKey === campaignKey);
  },

  getInviteByToken(t: string): SurveyInvite | null {
    return load().invites.find((i) => i.token === t) ?? null;
  },

  ensureInvite(input: {
    campaignKey: string;
    recipientId: string;
    managerName: string;
    orgName: string;
  }): SurveyInvite {
    const findExisting = (data: DevSurveyData) =>
      data.invites.find(
        (i) => i.campaignKey === input.campaignKey && i.recipientId === input.recipientId
      );

    const first = load();
    const hit = findExisting(first);
    if (hit) return hit;

    const invite: SurveyInvite = {
      token: token(),
      campaignKey: input.campaignKey,
      recipientId: input.recipientId,
      managerName: input.managerName,
      orgName: input.orgName,
      submittedAt: null,
      formSnapshot: null,
    };

    const fresh = load();
    const again = findExisting(fresh);
    if (again) return again;
    fresh.invites.push(invite);
    save(fresh);
    return invite;
  },

  getAnswersByInvite(inviteToken: string): SurveyAnswer[] {
    return load().answers.filter((a) => a.inviteToken === inviteToken);
  },

  getAnswersByCampaign(campaignKey: string): SurveyAnswer[] {
    const data = load();
    const tokens = new Set(
      data.invites.filter((i) => i.campaignKey === campaignKey).map((i) => i.token)
    );
    return data.answers.filter((a) => tokens.has(a.inviteToken));
  },

  countAnswersForQuestion(questionId: string): number {
    return load().answers.filter((a) => a.questionId === questionId).length;
  },

  reconcileStaleSubmissions(campaignKey: string): number {
    const data = load();
    let fixed = 0;
    for (const invite of data.invites) {
      if (invite.campaignKey !== campaignKey || !invite.submittedAt) continue;
      const answers = data.answers.filter((a) => a.inviteToken === invite.token);
      if (answers.length === 0) {
        invite.submittedAt = null;
        fixed++;
      }
    }
    if (fixed > 0) save(data);
    return fixed;
  },

  setInviteSnapshot(inviteToken: string, snapshot: import("@/lib/survey/types").SurveyFormSnapshot) {
    const data = load();
    const invite = data.invites.find((i) => i.token === inviteToken);
    if (!invite) throw new Error("유효하지 않은 설문 링크입니다.");
    if (invite.submittedAt) return;
    invite.formSnapshot = snapshot;
    save(data);
  },

  submitAnswers(inviteToken: string, answers: Omit<SurveyAnswer, "id" | "inviteToken" | "createdAt">[]) {
    const data = load();
    const invite = data.invites.find((i) => i.token === inviteToken);
    if (!invite) throw new Error("유효하지 않은 설문 링크입니다.");
    if (invite.submittedAt) throw new Error("이미 제출된 설문입니다.");
    const now = new Date().toISOString();
    for (const a of answers) {
      data.answers.push({
        id: uuid(),
        inviteToken,
        questionId: a.questionId,
        rowKey: a.rowKey ?? null,
        value: a.value,
        createdAt: now,
      });
    }
    invite.submittedAt = now;
    save(data);
  },

  getCampaignSettings(campaignKey: string): SurveyCampaignSettings {
    const data = load();
    return (
      data.settings[campaignKey] ?? {
        campaignKey,
        title: DEFAULT_SURVEY_CAMPAIGN_TITLE,
        introText: DEFAULT_SURVEY_INTRO_TEXT,
        headerImageUrl: null,
        completionMessage: DEFAULT_SURVEY_COMPLETION_MESSAGE,
      }
    );
  },

  saveCampaignSettings(settings: SurveyCampaignSettings) {
    const data = load();
    data.settings[settings.campaignKey] = settings;
    save(data);
  },

  getQuestionTemplates(): SurveyQuestionTemplate[] {
    return [...load().questionTemplates].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  },

  saveQuestionTemplate(
    name: string,
    snapshot: {
      title: string;
      introText: string;
      headerImageUrl: string | null;
      questions: SurveyQuestionTemplateItem[];
    }
  ): SurveyQuestionTemplate {
    const data = load();
    const tpl: SurveyQuestionTemplate = {
      id: uuid(),
      name,
      title: snapshot.title,
      introText: snapshot.introText,
      headerImageUrl: snapshot.headerImageUrl,
      questions: snapshot.questions,
    };
    data.questionTemplates.push(tpl);
    save(data);
    return tpl;
  },

  deleteQuestionTemplate(id: string) {
    const data = load();
    data.questionTemplates = data.questionTemplates.filter((t) => t.id !== id);
    save(data);
  },

  updateQuestionTemplate(
    id: string,
    name: string,
    snapshot: {
      title: string;
      introText: string;
      headerImageUrl: string | null;
      questions: SurveyQuestionTemplateItem[];
    }
  ): SurveyQuestionTemplate {
    const data = load();
    const idx = data.questionTemplates.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error("템플릿을 찾을 수 없습니다.");
    const prev = data.questionTemplates[idx]!;
    if (prev.isBuiltin && name.trim() !== prev.name) {
      throw new Error(`「${prev.name}」 기본 템플릿 이름은 변경할 수 없습니다.`);
    }
    const duplicate = data.questionTemplates.some((t) => t.id !== id && t.name === name.trim());
    if (duplicate) throw new Error("같은 이름의 템플릿이 이미 있습니다.");

    const tpl: SurveyQuestionTemplate = {
      ...prev,
      name: name.trim(),
      title: snapshot.title,
      introText: snapshot.introText,
      headerImageUrl: snapshot.headerImageUrl,
      questions: snapshot.questions,
    };
    data.questionTemplates[idx] = tpl;
    save(data);
    return tpl;
  },
};
