"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardList, ExternalLink, PlusCircle, Send } from "lucide-react";
import type { Project } from "@/lib/supabase";
import { navigateToNewProject } from "@/lib/navigate";
import { supabase } from "@/lib/supabase";
import {
  fetchManagerContacts,
  type ManagerContact,
} from "@/lib/manager-contacts";
import { formatManagerPhoneDisplay, sanitizeManagerPhoneDigits } from "@/lib/manager-display";
import { fetchSolapiStatus, sendMessageViaApi } from "@/lib/send-message-client";
import { appendSmsSendLog, buildSmsSendLogEntry } from "@/lib/sms-send-log";
import {
  describeSmsSendResult,
  shouldMarkRecipientAsSent,
} from "@/lib/recipient-sms-feedback";
import { MessageTemplateControls } from "@/components/MessageTemplateControls";
import { fetchBuiltinMessageTemplateBody } from "@/lib/message-templates";
import {
  applyBulkMessageOverride,
  deleteBulkMessageOverride,
  fetchCampaignMessageOverrides,
  upsertIndividualMessageOverride,
} from "@/lib/campaign-message-overrides";
import {
  fetchSmsRecipientFieldOverrides,
  upsertSmsRecipientFieldOverride,
} from "@/lib/sms-recipient-field-overrides";
import { SmsSendLogModal } from "@/components/SmsSendLogModal";
import { useSmsPendingSync } from "@/hooks/useSmsPendingSync";
import { ensureSmsPendingTracker, countCampaignSmsLogs } from "@/lib/sms-pending-tracker";
import {
  addRecipientSentId,
  fetchRecipientSentIds,
  removeRecipientSentId,
} from "@/lib/recipient-sent-storage";
import {
  currentYearMonth,
  deriveSurveyTemplateFromMessage,
  estimateMessageType,
  formatSurveyCampaignMonthLabel,
  groupProjectsIntoSurveyRecipients,
  resolveRecipientPhone,
  resolveRecipientSendStatus,
  resolveSurveyMessageBody,
  sortSurveyRecipientsByEventDate,
  surveyDeadlineLabel,
  type SurveyMessageBuildParams,
  type SurveyRecipient,
} from "@/lib/survey-messaging";
import { freezeInviteSnapshot } from "@/lib/survey/survey-form-snapshot";
import {
  fetchSurveyQuestionTemplateSummaries,
  type SurveyQuestionTemplateSummary,
} from "@/lib/survey/survey-question-templates";
import { SurveySendTemplatePicker } from "@/components/survey/SurveySendTemplatePicker";
import {
  ensureSurveyInvitesForRecipients,
} from "@/lib/survey/survey-invites";
import { buildSurveyPreviewUrl, buildSurveyPublicUrl } from "@/lib/survey/survey-url";

type Props = {
  projects: Project[];
};

type RecipientListFilter = "all" | "sent" | "pending" | "no_phone";

const FILTER_EMPTY_LABEL: Record<Exclude<RecipientListFilter, "all">, string> = {
  sent: "발송 완료된 담당자가 없습니다.",
  pending: "미발송 담당자가 없습니다.",
  no_phone: "연락처 없는 담당자가 없습니다.",
};

function filterChipClass(active: boolean, base: string) {
  return active
    ? `${base} ring-2 ring-[var(--primary)] ring-offset-1`
    : `${base} hover:opacity-90`;
}

function sendSurveyTemplateStorageKey(campaignKey: string) {
  return `parking-manager-survey-send-template:${campaignKey}`;
}

function readStoredSendTemplateId(campaignKey: string): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(sendSurveyTemplateStorageKey(campaignKey)) ?? "";
  } catch {
    return "";
  }
}

function writeStoredSendTemplateId(campaignKey: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      sessionStorage.setItem(sendSurveyTemplateStorageKey(campaignKey), id);
    } else {
      sessionStorage.removeItem(sendSurveyTemplateStorageKey(campaignKey));
    }
  } catch {
    // ignore
  }
}

function buildParams(
  recipient: SurveyRecipient,
  yearMonth: string,
  displayOrg: string,
  displayManager: string,
  surveyUrl?: string
): SurveyMessageBuildParams {
  return {
    displayOrgName: displayOrg,
    manager: displayManager,
    yearMonth,
    events: recipient.events,
    surveyUrl,
  };
}

function replaceInBody(body: string, from: string, to: string): string {
  if (!from || from === to) return body;
  return body.split(from).join(to);
}

export function SatisfactionSurveyPanel({ projects }: Props) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [orgOverrides, setOrgOverrides] = useState<Record<string, string>>({});
  const [managerOverrides, setManagerOverrides] = useState<Record<string, string>>({});
  const [phoneOverrides, setPhoneOverrides] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkTemplates, setBulkTemplates] = useState<Record<string, string>>({});
  const [individualMessages, setIndividualMessages] = useState<
    Record<string, Record<string, string>>
  >({});
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<RecipientListFilter>("all");
  const [solapiConfigured, setSolapiConfigured] = useState<boolean | null>(null);
  const [logVersion, setLogVersion] = useState(0);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [pendingRecipientIds, setPendingRecipientIds] = useState<Set<string>>(() => new Set());
  const [managerContacts, setManagerContacts] = useState<ManagerContact[]>([]);
  const [builtinTemplateBody, setBuiltinTemplateBody] = useState("");
  const [surveyUrls, setSurveyUrls] = useState<Record<string, string>>({});
  const [sendTemplateSummaries, setSendTemplateSummaries] = useState<
    SurveyQuestionTemplateSummary[]
  >([]);
  const [sendTemplateId, setSendTemplateId] = useState("");
  const [sendTemplateOverrides, setSendTemplateOverrides] = useState<
    Record<string, Record<string, string>>
  >({});
  const loadedOverrideKeysRef = useRef<Set<string>>(new Set());
  const previewPanelRef = useRef<HTMLDivElement>(null);

  const refreshBuiltinTemplate = useCallback(async () => {
    const body = await fetchBuiltinMessageTemplateBody(supabase, "survey");
    setBuiltinTemplateBody(body);
  }, []);

  useEffect(() => {
    void refreshBuiltinTemplate();
  }, [refreshBuiltinTemplate]);

  useEffect(() => {
    void (async () => {
      const summaries = await fetchSurveyQuestionTemplateSummaries(supabase);
      setSendTemplateSummaries(summaries);
      const stored = readStoredSendTemplateId(yearMonth);
      const validStored = stored && summaries.some((t) => t.id === stored);
      const builtin = summaries.find((t) => t.isBuiltin);
      setSendTemplateId(validStored ? stored : (builtin?.id ?? summaries[0]?.id ?? ""));
    })();
  }, [yearMonth]);

  const resolveSendTemplateId = useCallback(
    (recipientId: string) => sendTemplateOverrides[yearMonth]?.[recipientId] ?? sendTemplateId,
    [sendTemplateOverrides, yearMonth, sendTemplateId]
  );

  const handleSendTemplateChange = (recipientId: string, id: string) => {
    setSendTemplateOverrides((prev) => ({
      ...prev,
      [yearMonth]: { ...prev[yearMonth], [recipientId]: id },
    }));
    setSendTemplateId(id);
    writeStoredSendTemplateId(yearMonth, id);
  };

  useSmsPendingSync({
    campaign: "survey",
    campaignKey: yearMonth,
    onSentIdsChange: setSentIds,
    onPendingIdsChange: setPendingRecipientIds,
    onLogChange: () => setLogVersion((v) => v + 1),
  });

  useEffect(() => {
    void fetchSolapiStatus().then((s) => setSolapiConfigured(s.configured));
  }, []);

  useEffect(() => {
    void (async () => {
      const contacts = await fetchManagerContacts(supabase);
      setManagerContacts(contacts);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const fields = await fetchSmsRecipientFieldOverrides(supabase, "survey");
      setOrgOverrides(fields.org);
      setManagerOverrides(fields.manager);
      setPhoneOverrides(fields.phone);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const [messages, sent] = await Promise.all([
        loadedOverrideKeysRef.current.has(yearMonth)
          ? Promise.resolve({ bulk: {}, individual: {} })
          : fetchCampaignMessageOverrides(supabase, "survey", yearMonth),
        fetchRecipientSentIds(supabase, "survey", yearMonth),
      ]);
      if (!loadedOverrideKeysRef.current.has(yearMonth)) {
        loadedOverrideKeysRef.current.add(yearMonth);
        setBulkTemplates((prev) => ({ ...prev, ...messages.bulk }));
        setIndividualMessages((prev) => ({ ...prev, ...messages.individual }));
      }
      setSentIds(sent);
    })();
    setIsEditing(false);
    setApplyFeedback(null);
    setListFilter("all");
  }, [yearMonth]);

  const recipients = useMemo(
    () => groupProjectsIntoSurveyRecipients(projects, yearMonth, sentIds, managerContacts),
    [projects, yearMonth, sentIds, managerContacts]
  );

  const displayRecipients = useMemo(
    () =>
      recipients.map((r) => {
        const managerPhone = resolveRecipientPhone(r, phoneOverrides);
        const sendStatus = resolveRecipientSendStatus(r, sentIds, phoneOverrides);
        return { ...r, managerPhone, sendStatus };
      }),
    [recipients, phoneOverrides, sentIds]
  );

  const sortedDisplayRecipients = useMemo(
    () => sortSurveyRecipientsByEventDate(displayRecipients),
    [displayRecipients]
  );

  const filteredRecipients = useMemo(() => {
    if (listFilter === "all") return sortedDisplayRecipients;
    return sortedDisplayRecipients.filter((r) => r.sendStatus === listFilter);
  }, [sortedDisplayRecipients, listFilter]);

  const recipientIdsKey = useMemo(
    () => sortedDisplayRecipients.map((r) => r.id).sort().join("|"),
    [sortedDisplayRecipients]
  );

  useEffect(() => {
    if (filteredRecipients.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredRecipients.some((r) => r.id === selectedId)) {
      setSelectedId(filteredRecipients[0]!.id);
    }
  }, [filteredRecipients, selectedId]);

  const selected = filteredRecipients.find((r) => r.id === selectedId)
    ?? sortedDisplayRecipients.find((r) => r.id === selectedId)
    ?? null;

  const displayOrg = selected
    ? (orgOverrides[selected.id] ?? selected.displayOrgName)
    : "";

  const displayManager = selected
    ? (managerOverrides[selected.id] ?? selected.manager)
    : "";

  const displayPhone = selected
    ? (phoneOverrides[selected.id] ?? selected.managerPhone ?? "")
    : "";

  const bulkTemplate = bulkTemplates[yearMonth] ?? null;
  const individualBody = selected
    ? (individualMessages[yearMonth]?.[selected.id] ?? null)
    : null;

  useEffect(() => {
    if (sortedDisplayRecipients.length === 0) {
      setSurveyUrls({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const map = await ensureSurveyInvitesForRecipients(
        supabase,
        yearMonth,
        sortedDisplayRecipients.map((r) => ({
          id: r.id,
          managerName: managerOverrides[r.id] ?? r.manager,
          orgName: orgOverrides[r.id] ?? r.displayOrgName,
        }))
      );
      if (cancelled) return;
      const urls: Record<string, string> = {};
      map.forEach((inv, recipientId) => {
        urls[recipientId] = buildSurveyPublicUrl(inv.token);
      });
      setSurveyUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, recipientIdsKey]);

  const resolveBody = useCallback(
    (recipient: SurveyRecipient, org: string, manager: string, surveyUrl?: string) => {
      const params = buildParams(
        recipient,
        yearMonth,
        org,
        manager,
        surveyUrl ?? surveyUrls[recipient.id]
      );
      const individual = individualMessages[yearMonth]?.[recipient.id] ?? null;
      return resolveSurveyMessageBody(params, {
        individualBody: individual,
        bulkTemplate,
        defaultTemplate: builtinTemplateBody,
      });
    },
    [yearMonth, individualMessages, bulkTemplates, builtinTemplateBody, surveyUrls]
  );

  const previewBody = useMemo(() => {
    if (!selected) return "";
    return resolveBody(selected, displayOrg, displayManager);
  }, [selected, displayOrg, displayManager, resolveBody]);

  useEffect(() => {
    if (!isEditing && selected) {
      setEditDraft(resolveBody(selected, displayOrg, displayManager));
    }
  }, [selected?.id, displayOrg, displayManager, isEditing, previewBody, selected, resolveBody]);

  const messageType = previewBody ? estimateMessageType(previewBody) : "LMS";

  const stats = useMemo(() => {
    let sent = 0;
    let pending = 0;
    let noPhone = 0;
    for (const r of displayRecipients) {
      if (r.sendStatus === "sent") sent++;
      else if (r.sendStatus === "no_phone") noPhone++;
      else pending++;
    }
    return { sent, pending, noPhone, total: displayRecipients.length };
  }, [displayRecipients]);

  const showFeedback = (msg: string) => {
    setApplyFeedback(msg);
    window.setTimeout(() => setApplyFeedback(null), 2500);
  };

  const saveIndividual = (recipientId: string, body: string) => {
    const trimmed = body.trim();
    const next = { ...individualMessages };
    const monthMap = { ...(next[yearMonth] ?? {}) };
    monthMap[recipientId] = trimmed;
    next[yearMonth] = monthMap;
    setIndividualMessages(next);
    void upsertIndividualMessageOverride(
      supabase,
      "survey",
      yearMonth,
      recipientId,
      trimmed
    ).catch((err) =>
      showFeedback(err instanceof Error ? err.message : "개별 문구 저장에 실패했습니다.")
    );
  };

  const syncNameChangeInDraft = (prev: string, from: string, to: string) =>
    replaceInBody(prev, from, to);

  const patchIndividualBody = (recipientId: string, from: string, to: string) => {
    const stored = individualMessages[yearMonth]?.[recipientId];
    if (!stored) return;
    const nextBody = replaceInBody(stored, from, to);
    if (nextBody === stored) return;
    saveIndividual(recipientId, nextBody);
  };

  const handleOrgChange = (newOrg: string) => {
    if (!selected) return;
    const prevOrg = orgOverrides[selected.id] ?? selected.displayOrgName;
    setOrgOverrides((prev) => ({ ...prev, [selected.id]: newOrg }));
    void upsertSmsRecipientFieldOverride(supabase, "survey", selected.id, { orgName: newOrg });
    if (isEditing) {
      setEditDraft((d) => syncNameChangeInDraft(d, prevOrg, newOrg));
    }
    patchIndividualBody(selected.id, prevOrg, newOrg);
  };

  const handleManagerChange = (newManager: string) => {
    if (!selected) return;
    const prevManager = managerOverrides[selected.id] ?? selected.manager;
    setManagerOverrides((prev) => ({ ...prev, [selected.id]: newManager }));
    void upsertSmsRecipientFieldOverride(supabase, "survey", selected.id, {
      managerName: newManager,
    });
    if (isEditing) {
      setEditDraft((d) => syncNameChangeInDraft(d, prevManager, newManager));
    }
    patchIndividualBody(selected.id, prevManager, newManager);
  };

  const handlePhoneChange = (raw: string) => {
    if (!selected) return;
    const digits = sanitizeManagerPhoneDigits(raw);
    const next = { ...phoneOverrides, [selected.id]: digits };
    setPhoneOverrides(next);
    void upsertSmsRecipientFieldOverride(supabase, "survey", selected.id, { phone: digits });
  };

  const handleStartEdit = () => {
    if (!selected) return;
    setEditDraft(resolveBody(selected, displayOrg, displayManager));
    setIsEditing(true);
    setApplyFeedback(null);
  };

  const handleApplyIndividual = () => {
    if (!selected || !editDraft.trim()) return;
    saveIndividual(selected.id, editDraft);
    setIsEditing(false);
    showFeedback("현재 담당자에 개별 적용되었습니다.");
  };

  const handleApplyBulk = async () => {
    if (!selected || !editDraft.trim()) return;
    const params = buildParams(selected, yearMonth, displayOrg, displayManager);
    const template = deriveSurveyTemplateFromMessage(editDraft, params);
    try {
      const data = await applyBulkMessageOverride(supabase, "survey", yearMonth, template);
      loadedOverrideKeysRef.current.add(yearMonth);
      setBulkTemplates(data.bulk);
      setIndividualMessages(data.individual);
      setIsEditing(false);
      showFeedback("이 달 전체 담당자에 일괄 적용되었습니다.");
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : "일괄 문구 저장에 실패했습니다.");
    }
  };

  const handleResetBulk = async () => {
    if (!bulkTemplates[yearMonth]) return;
    const ok = confirm(
      "이 달에 일괄 적용한 문구를 취소하고 기본 문구로 되돌릴까요?\n(개별 적용 문구는 유지됩니다.)"
    );
    if (!ok) return;
    try {
      await deleteBulkMessageOverride(supabase, "survey", yearMonth);
      loadedOverrideKeysRef.current.add(yearMonth);
      const nextBulk = { ...bulkTemplates };
      delete nextBulk[yearMonth];
      setBulkTemplates(nextBulk);
      setIsEditing(false);
      showFeedback("기본 문구로 되돌렸습니다.");
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : "일괄 문구 삭제에 실패했습니다.");
    }
  };

  const getTemplateBodyForSave = useCallback(() => {
    if (!selected) return "";
    const params = buildParams(selected, yearMonth, displayOrg, displayManager);
    if (isEditing && editDraft.trim()) {
      return deriveSurveyTemplateFromMessage(editDraft, params);
    }
    if (bulkTemplate?.trim()) return bulkTemplate.trim();
    return deriveSurveyTemplateFromMessage(previewBody, params);
  }, [
    selected,
    yearMonth,
    displayOrg,
    displayManager,
    isEditing,
    editDraft,
    bulkTemplate,
    previewBody,
  ]);

  const trackedTemplateBody = getTemplateBodyForSave();

  const handleApplySavedTemplate = async (body: string) => {
    try {
      const data = await applyBulkMessageOverride(supabase, "survey", yearMonth, body);
      loadedOverrideKeysRef.current.add(yearMonth);
      setBulkTemplates(data.bulk);
      setIndividualMessages(data.individual);
      setIsEditing(false);
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : "템플릿 적용에 실패했습니다.");
    }
  };

  const handleSurveyPreview = async () => {
    if (!selected) return;
    const templateId = resolveSendTemplateId(selected.id);
    if (!templateId) {
      alert("미리볼 설문 템플릿을 선택해 주세요.");
      return;
    }
    const org = orgOverrides[selected.id] ?? selected.displayOrgName;
    const manager = managerOverrides[selected.id] ?? selected.manager;
    let inviteToken = "";
    const existingUrl = surveyUrls[selected.id];
    if (existingUrl) {
      inviteToken = existingUrl.split("/").filter(Boolean).pop()?.split("?")[0] ?? "";
    }
    if (!inviteToken) {
      const map = await ensureSurveyInvitesForRecipients(supabase, yearMonth, [
        { id: selected.id, managerName: manager, orgName: org },
      ]);
      const invite = map.get(selected.id);
      if (!invite) {
        alert("설문 링크를 만들지 못했습니다.");
        return;
      }
      inviteToken = invite.token;
      setSurveyUrls((prev) => ({
        ...prev,
        [selected.id]: buildSurveyPublicUrl(invite.token),
      }));
    }
    window.open(buildSurveyPreviewUrl(inviteToken, templateId), "_blank", "noopener,noreferrer");
  };

  const handleSend = async (recipient: SurveyRecipient) => {
    if (recipient.sendStatus !== "pending") return;
    const org = orgOverrides[recipient.id] ?? recipient.displayOrgName;
    const manager = managerOverrides[recipient.id] ?? recipient.manager;
    let surveyUrl = surveyUrls[recipient.id];
    let inviteToken = "";
    if (!surveyUrl) {
      const map = await ensureSurveyInvitesForRecipients(supabase, yearMonth, [
        {
          id: recipient.id,
          managerName: manager,
          orgName: org,
        },
      ]);
      const invite = map.get(recipient.id);
      if (!invite) throw new Error("설문 링크를 만들지 못했습니다.");
      inviteToken = invite.token;
      surveyUrl = buildSurveyPublicUrl(invite.token);
      setSurveyUrls((prev) => ({ ...prev, [recipient.id]: surveyUrl }));
    } else {
      inviteToken = surveyUrl.split("/").filter(Boolean).pop() ?? "";
    }
    if (inviteToken) {
      const templateId = resolveSendTemplateId(recipient.id);
      if (!templateId) {
        alert("발송할 설문 템플릿을 선택해 주세요.");
        return;
      }
      await freezeInviteSnapshot(supabase, inviteToken, { templateId });
    }
    const preview = resolveBody(recipient, org, manager, surveyUrl);
    const phone = resolveRecipientPhone(recipient, phoneOverrides);
    if (!phone) {
      alert("연락처가 없어 발송할 수 없습니다.");
      return;
    }
    if (solapiConfigured === false) {
      alert(
        "솔라피 API가 설정되지 않았습니다.\n.env.local에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER를 추가한 뒤 개발 서버를 재시작해 주세요."
      );
      return;
    }
    setSendingId(recipient.id);
    try {
      const result = await sendMessageViaApi({ to: phone, text: preview });
      await appendSmsSendLog(
        supabase,
        buildSmsSendLogEntry({
          campaign: "survey",
          campaignKey: yearMonth,
          recipientId: recipient.id,
          managerName: manager,
          orgName: org,
          to: phone,
          messageId: result.messageId,
          statusCode: result.statusCode,
          statusMessage: result.statusMessage,
        })
      );
      setLogVersion((v) => v + 1);
      void ensureSmsPendingTracker();

      if (result.outcome === "pending") {
        setPendingRecipientIds((prev) => new Set(prev).add(recipient.id));
      }

      if (shouldMarkRecipientAsSent(result)) {
        const next = new Set(sentIds);
        next.add(recipient.id);
        setSentIds(next);
        void addRecipientSentId(supabase, "survey", yearMonth, recipient.id);
      }

      showFeedback(describeSmsSendResult(result));
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : "문자 발송에 실패했습니다.");
    } finally {
      setSendingId(null);
    }
  };

  const handleUnsend = (recipientId: string) => {
    if (!sentIds.has(recipientId)) return;
    const ok = confirm(
      "이 담당자를 발송 완료 목록에서 빼고 다시 미발송 상태로 되돌릴까요?\n(솔라피 발송 기록은 유지됩니다.)"
    );
    if (!ok) return;
    const next = new Set(sentIds);
    next.delete(recipientId);
    setSentIds(next);
    void removeRecipientSentId(supabase, "survey", yearMonth, recipientId);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleSelectRecipient = (id: string) => {
    if (isEditing) {
      const ok = confirm("편집 중인 내용이 있습니다. 저장하지 않고 이동할까요?");
      if (!ok) return;
      setIsEditing(false);
    }
    setSelectedId(id);
  };

  return (
    <div className="space-y-4">
      {projects.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[var(--text-muted)]">등록된 기관이 없습니다.</p>
          <button
            type="button"
            onClick={navigateToNewProject}
            className="btn btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <PlusCircle className="h-4 w-4" />
            기관 등록
          </button>
        </div>
      ) : (
        <>
      <div className="card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h3 className="text-base font-bold text-[var(--text)]">만족도 조사 발송</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            담당자별 1통 · 수동 발송{" "}
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-amber-200/80">
              마감기한 : {surveyDeadlineLabel(yearMonth)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            대상 월
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="input px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setListFilter("all")}
              className={filterChipClass(
                listFilter === "all",
                "rounded-full bg-[var(--bg)] px-2.5 py-1 font-medium text-[var(--text)]"
              )}
            >
              대상 {stats.total}명
            </button>
            <button
              type="button"
              onClick={() => setListFilter("sent")}
              className={filterChipClass(
                listFilter === "sent",
                "rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800"
              )}
            >
              발송 완료 {stats.sent}
            </button>
            <button
              type="button"
              onClick={() => setListFilter("pending")}
              className={filterChipClass(
                listFilter === "pending",
                "rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-900"
              )}
            >
              미발송 {stats.pending}
            </button>
            <button
              type="button"
              onClick={() => setListFilter("no_phone")}
              className={filterChipClass(
                listFilter === "no_phone",
                "rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600"
              )}
            >
              연락처 없음 {stats.noPhone}
            </button>
          </div>
        </div>
      </div>

      {displayRecipients.length > 0 && (
        <SmsSendLogModal
          open={logModalOpen}
          onClose={() => setLogModalOpen(false)}
          campaign="survey"
          campaignKey={yearMonth}
          logVersion={logVersion}
        />
      )}

      {displayRecipients.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[var(--text-muted)]">
            {formatSurveyCampaignMonthLabel(yearMonth)}에 종료된 행사가 없습니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="card overflow-hidden lg:col-span-3">
            <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] bg-[#F8FAFC] px-4 py-3">
              <div>
                <h4 className="text-sm font-bold text-[var(--text)]">담당자 목록</h4>
                {listFilter !== "all" && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    필터 적용 중 · {filteredRecipients.length}명
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLogModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[#F8FAFC]"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                발송 기록
                {countCampaignSmsLogs("survey", yearMonth) > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                    {countCampaignSmsLogs("survey", yearMonth)}
                  </span>
                )}
              </button>
            </div>
            <ul className="max-h-[32rem] divide-y divide-[var(--border)] overflow-y-auto">
              {filteredRecipients.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                  {listFilter === "all"
                    ? "담당자가 없습니다."
                    : FILTER_EMPTY_LABEL[listFilter]}
                </li>
              ) : (
              filteredRecipients.map((r) => {
                const active = selectedId === r.id;
                const expanded = expandedIds.has(r.id);
                const isSent = r.sendStatus === "sent";
                const noPhone = r.sendStatus === "no_phone";
                const hasIndividual = Boolean(individualMessages[yearMonth]?.[r.id]);
                return (
                  <li
                    key={r.id}
                    className={`transition-colors ${
                      isSent ? "bg-emerald-50/60" : active ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <div
                      className="flex cursor-pointer items-start gap-3 px-4 py-3"
                      onClick={() => handleSelectRecipient(r.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectRecipient(r.id);
                        }
                      }}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isSent ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="발송 완료" />
                        ) : (
                          <span
                            className={`inline-block h-5 w-5 rounded-full border-2 ${
                              active ? "border-[var(--primary)] bg-white" : "border-[var(--border)] bg-white"
                            }`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--text)]">
                            {managerOverrides[r.id] ?? r.manager}
                          </span>
                          {isSent && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                              발송 완료
                            </span>
                          )}
                          {hasIndividual && (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                              문구 개별
                            </span>
                          )}
                          {noPhone && (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              담당자 연락처 없음
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                          {orgOverrides[r.id] ?? r.displayOrgName}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {noPhone
                            ? "담당자 연락처 없음"
                            : formatManagerPhoneDisplay(
                                phoneOverrides[r.id] ?? r.managerPhone
                              ) || "—"}
                          {" · "}행사 {r.events.length}건
                        </p>
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(r.id);
                          }}
                        >
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          행사 목록
                        </button>
                        {expanded && (
                          <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                            {r.events.map((ev) => (
                              <li key={ev.projectId}>
                                {ev.eventName} [ {ev.dateLabel} ]
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={
                          r.sendStatus !== "pending" ||
                          sendingId === r.id ||
                          pendingRecipientIds.has(r.id)
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSend(r);
                        }}
                        className="btn btn-primary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sendingId === r.id || pendingRecipientIds.has(r.id)
                          ? "발송 중…"
                          : isSent
                            ? "발송됨"
                            : "발송"}
                      </button>
                    </div>
                  </li>
                );
              })
              )}
            </ul>
          </div>

          <div className="card flex flex-col lg:col-span-2">
            <div className="border-b border-[var(--border)] bg-[#F8FAFC] px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">문자 미리보기</h4>
                  {selected && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {messageType} ·{" "}
                      {new TextEncoder().encode(isEditing ? editDraft : previewBody).length}바이트
                      {bulkTemplate && !individualBody && (
                        <span className="ml-1.5 text-violet-700">· 일괄 문구 적용 중</span>
                      )}
                      {individualBody && (
                        <span className="ml-1.5 text-violet-700">· 개별 문구</span>
                      )}
                    </p>
                  )}
                </div>
                {selected && (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {sentIds.has(selected.id) && (
                      <button
                        type="button"
                        onClick={() => handleUnsend(selected.id)}
                        className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
                      >
                        발송 완료 취소
                      </button>
                    )}
                    {!isEditing ? (
                      <>
                        {bulkTemplate && (
                          <button
                            type="button"
                            onClick={handleResetBulk}
                            className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                          >
                            일괄 적용 취소
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[#F8FAFC]"
                        >
                          수정
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleApplyIndividual}
                          className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                        >
                          개별 적용
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyBulk}
                          className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                        >
                          일괄 적용
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(false);
                            setEditDraft(previewBody);
                          }}
                          className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[#F8FAFC]"
                        >
                          취소
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {applyFeedback && (
                <p className="mt-2 text-xs font-medium text-emerald-700">{applyFeedback}</p>
              )}
            </div>
            <div ref={previewPanelRef} className="flex flex-1 flex-col p-4">
              {!selected ? (
                <p className="text-sm text-[var(--text-muted)]">담당자를 선택하세요.</p>
              ) : (
                <>
                  <MessageTemplateControls
                    campaign="survey"
                    getTemplateBody={getTemplateBodyForSave}
                    trackedTemplateBody={trackedTemplateBody}
                    onApplyTemplate={handleApplySavedTemplate}
                    onFeedback={showFeedback}
                    onTemplatesChanged={refreshBuiltinTemplate}
                  />
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-[var(--text-muted)]">
                      대표 기관명 (발송 전 수정)
                      <input
                        type="text"
                        value={displayOrg}
                        onChange={(e) => handleOrgChange(e.target.value)}
                        className="input mt-1 w-full px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-xs font-medium text-[var(--text-muted)]">
                      담당자 명 (발송 전 수정)
                      <input
                        type="text"
                        value={displayManager}
                        onChange={(e) => handleManagerChange(e.target.value)}
                        className="input mt-1 w-full px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-[var(--text-muted)]">
                      담당자 연락처 (발송 전 수정)
                      <input
                        type="tel"
                        value={displayPhone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        placeholder="01012345678"
                        className="input mt-1 w-full px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="block text-xs font-medium text-[var(--text-muted)]">
                      <span className="block">설문 템플릿 (발송 전 지정)</span>
                      <SurveySendTemplatePicker
                        value={resolveSendTemplateId(selected.id)}
                        options={sendTemplateSummaries}
                        onChange={(id) => handleSendTemplateChange(selected.id, id)}
                        disabled={sendTemplateSummaries.length === 0}
                        menuAlignRef={previewPanelRef}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <button
                      type="button"
                      onClick={() => void handleSurveyPreview()}
                      disabled={!resolveSendTemplateId(selected.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      설문 미리보기
                    </button>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      선택한 템플릿으로 새 탭에서 확인합니다. 미리보기에서는 제출할 수 없습니다.
                    </p>
                  </div>
                  {!displayPhone && (
                    <p className="mb-3 text-xs text-amber-800">
                      연락처가 없어 발송할 수 없습니다. 번호를 직접 입력해 주세요.
                    </p>
                  )}
                  {isEditing ? (
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="input min-h-80 flex-1 resize-y px-3 py-2 font-mono text-xs leading-relaxed"
                      spellCheck={false}
                    />
                  ) : (
                    <pre className="max-h-80 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[#FAFAFA] p-3 text-xs leading-relaxed text-[var(--text)]">
                      {previewBody}
                    </pre>
                  )}
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    {isEditing ? (
                      <>
                        <strong>개별 적용</strong>은 현재 담당자만, <strong>일괄 적용</strong>은 이 달
                        전체 담당자에게 같은 문구 틀을 적용합니다(기관명·담당자·행사 목록은 자동 치환).
                      </>
                    ) : solapiConfigured === false ? (
                      <>
                        솔라피 API가 설정되지 않았습니다. .env.local에 SOLAPI_API_KEY, SOLAPI_API_SECRET,
                        SOLAPI_SENDER를 추가한 뒤 서버를 재시작해 주세요.
                      </>
                    ) : (
                      <>
                        발송 버튼을 누르면 솔라피로 실제 문자가 발송됩니다. 처리 결과는
                        백그라운드에서 자동 추적되며, 다른 탭·창으로 이동해도 계속 확인합니다.{" "}
                        <strong>발송 완료(4000)</strong> 상태일 때만 목록에 발송됨으로 표시됩니다.
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
