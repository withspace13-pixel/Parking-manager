"use client";

// 만족도 설문 응답·담당자별 제출 현황 (문자 발송 기준 상태)
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, ExternalLink } from "lucide-react";
import type { Project } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { fetchManagerContacts } from "@/lib/manager-contacts";
import { fetchRecipientSentIds } from "@/lib/recipient-sent-storage";
import { fetchSurveyQuestions } from "@/lib/survey/survey-questions";
import {
  ensureSurveyInvitesForRecipients,
  fetchSurveyInvitesWithAnswers,
  type SurveyInviteWithAnswers,
} from "@/lib/survey/survey-invites";
import {
  resolveSurveyResponseStatus,
  SURVEY_RESPONSE_STATUS_LABEL,
  type SurveyResponseStatus,
} from "@/lib/survey/survey-response-status";
import { buildSurveyPublicUrl } from "@/lib/survey/survey-url";
import { downloadSurveyResponsesExcel } from "@/lib/survey/survey-responses-export";
import { reconcileStaleSurveySubmissions } from "@/lib/survey/survey-submission-guard";
import { groupProjectsIntoSurveyRecipients } from "@/lib/survey-messaging";
import type { SurveyQuestion } from "@/lib/survey/types";

type Props = {
  campaignKey: string;
  projects: Project[];
};

type ResponseFilter = "all" | SurveyResponseStatus;

const FILTER_OPTIONS: Array<{ id: ResponseFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "not_sent", label: SURVEY_RESPONSE_STATUS_LABEL.not_sent },
  { id: "sent_pending", label: SURVEY_RESPONSE_STATUS_LABEL.sent_pending },
  { id: "submitted", label: SURVEY_RESPONSE_STATUS_LABEL.submitted },
];

function statusClassName(status: SurveyResponseStatus): string {
  if (status === "submitted") return "text-emerald-600";
  if (status === "sent_pending") return "text-amber-600";
  return "text-[var(--text-muted)]";
}

export function SurveyResponsesManager({ campaignKey, projects }: Props) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [invites, setInvites] = useState<SurveyInviteWithAnswers[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  const [recipients, setRecipients] = useState(
    () => [] as ReturnType<typeof groupProjectsIntoSurveyRecipients>
  );
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reconciledNotice, setReconciledNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResponseFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const projectsSurveyKey = useMemo(
    () =>
      projects
        .map(
          (p) =>
            `${p.id}:${p.end_date}:${p.manager}:${p.org_name}:${p.manager_phone ?? ""}`
        )
        .sort()
        .join("|"),
    [projects]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [qs, contacts, sent] = await Promise.all([
        fetchSurveyQuestions(supabase, campaignKey),
        fetchManagerContacts(supabase),
        fetchRecipientSentIds(supabase, "survey", campaignKey),
      ]);
      const grouped = groupProjectsIntoSurveyRecipients(
        projectsRef.current,
        campaignKey,
        sent,
        contacts
      );
      await ensureSurveyInvitesForRecipients(
        supabase,
        campaignKey,
        grouped.map((r) => ({
          id: r.id,
          managerName: r.manager,
          orgName: r.displayOrgName,
        }))
      );
      const inv = await fetchSurveyInvitesWithAnswers(supabase, campaignKey);
      const fixed = await reconcileStaleSurveySubmissions(supabase, campaignKey);
      const invFresh =
        fixed > 0 ? await fetchSurveyInvitesWithAnswers(supabase, campaignKey) : inv;
      setQuestions(qs);
      setInvites(invFresh);
      setSentIds(sent);
      setRecipients(grouped);
      setReconciledNotice(
        fixed > 0
          ? `응답 내용이 없는데 제출 완료로 표시된 ${fixed}건을 발송됨(미제출) 상태로 정리했습니다. (질문 변경 시 응답이 삭제된 경우입니다.)`
          : null
      );
    } finally {
      setLoading(false);
    }
  }, [campaignKey]);

  useEffect(() => {
    void reload();
  }, [reload, projectsSurveyKey]);

  const inviteByRecipient = useMemo(() => {
    const map = new Map<string, SurveyInviteWithAnswers>();
    for (const i of invites) map.set(i.recipientId, i);
    return map;
  }, [invites]);

  const rows = useMemo(
    () =>
      recipients.map((r) => {
        const invite = inviteByRecipient.get(r.id);
        const status = resolveSurveyResponseStatus(r.id, sentIds, invite);
        const showLink = status !== "not_sent" && invite;
        return {
          recipient: r,
          invite,
          status,
          surveyUrl: showLink ? buildSurveyPublicUrl(invite!.token) : undefined,
        };
      }),
    [recipients, inviteByRecipient, sentIds]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const stats = useMemo(() => {
    let notSent = 0;
    let sentPending = 0;
    let submitted = 0;
    for (const row of rows) {
      if (row.status === "not_sent") notSent++;
      else if (row.status === "sent_pending") sentPending++;
      else submitted++;
    }
    return { notSent, sentPending, submitted, total: rows.length };
  }, [rows]);

  const answerLabel = (
    invite: SurveyInviteWithAnswers | undefined,
    questionId: string,
    rowKey: string | null,
    value: string
  ) => {
    const snapshotQuestions = invite?.formSnapshot?.questions ?? [];
    const q =
      snapshotQuestions.find((x) => x.id === questionId) ??
      questions.find((x) => x.id === questionId);
    if (!q) return value;
    if (rowKey) return `「${q.title}」 ${rowKey}: ${value}`;
    return `「${q.title}」 ${value}`;
  };

  const handleExcelDownload = () => {
    if (rows.length === 0) return;
    setExporting(true);
    try {
      downloadSurveyResponsesExcel(
        campaignKey,
        rows.map(({ recipient, invite, status }) => ({
          orgName: recipient.displayOrgName,
          managerName: recipient.manager,
          status,
          answers: invite?.answers ?? [],
          formSnapshot: invite?.formSnapshot,
        }))
      );
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">응답 불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">
        이 달 종료 행사 담당자 목록입니다. <strong>미발송</strong>은 문자를 아직 보내지 않은
        상태이고, <strong>발송됨(미제출)</strong>은 문자는 보냈지만 설문을 아직 제출하지 않은
        상태입니다.
      </p>
      {reconciledNotice ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {reconciledNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          <span>전체 {stats.total}</span>
          <span>· 미발송 {stats.notSent}</span>
          <span>· 발송됨(미제출) {stats.sentPending}</span>
          <span>· 응답완료 {stats.submitted}</span>
        </div>
        <button
          type="button"
          onClick={handleExcelDownload}
          disabled={exporting || rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? "다운로드 중…" : "Excel 다운로드"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.id
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--bg)] text-[var(--text-muted)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-2">기관 / 담당자</th>
              <th className="px-4 py-2">상태</th>
              <th className="px-4 py-2">제출 시각</th>
              <th className="px-4 py-2">링크</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  {rows.length === 0
                    ? "해당 월 종료 행사 담당자가 없습니다."
                    : "선택한 상태에 해당하는 담당자가 없습니다."}
                </td>
              </tr>
            ) : (
              filtered.map(({ recipient: r, invite, status, surveyUrl }) => (
                <Fragment key={r.id}>
                  <tr
                    className="border-t border-[var(--border)] hover:bg-[var(--bg)]/50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.displayOrgName}</div>
                      <div className="text-xs text-[var(--text-muted)]">{r.manager}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusClassName(status)}>
                        {SURVEY_RESPONSE_STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                      {invite?.submittedAt
                        ? new Date(invite.submittedAt).toLocaleString("ko-KR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {surveyUrl ? (
                        <div className="flex items-center gap-1">
                          <a
                            href={surveyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded p-1 hover:bg-[var(--bg)]"
                            title="미리보기"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-[var(--bg)]"
                            title="링크 복사"
                            onClick={() => void navigator.clipboard.writeText(surveyUrl)}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === r.id && invite && invite.answers.length > 0 && (
                    <tr className="border-t border-[var(--border)] bg-[var(--bg)]/30">
                      <td colSpan={4} className="px-4 py-3">
                        <ul className="space-y-1 text-xs">
                          {invite.answers.map((a, i) => (
                            <li key={i}>{answerLabel(invite, a.questionId, a.rowKey, a.value)}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
