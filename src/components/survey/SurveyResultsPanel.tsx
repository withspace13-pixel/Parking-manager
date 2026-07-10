"use client";

// 만족도조사 결과 — 질문·응답·요약 탭
import { useState } from "react";
import type { Project } from "@/lib/supabase";
import { currentYearMonth } from "@/lib/survey-messaging";
import { SurveyQuestionsManager } from "@/components/survey/SurveyQuestionsManager";
import { SurveyResponsesManager } from "@/components/survey/SurveyResponsesManager";
import { SurveySummaryView } from "@/components/survey/SurveySummaryView";

type Props = {
  projects: Project[];
};

type SubView = "questions" | "responses" | "summary";

const TABS: Array<{ id: SubView; label: string }> = [
  { id: "questions", label: "질문 관리" },
  { id: "responses", label: "응답 관리" },
  { id: "summary", label: "요약" },
];

export function SurveyResultsPanel({ projects }: Props) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [subView, setSubView] = useState<SubView>("questions");

  return (
    <div className="card mb-10 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-2 text-base font-bold text-[var(--text)]">만족도조사 결과</h3>
          <div className="inline-flex rounded-full bg-[var(--bg)] p-1 text-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubView(tab.id)}
                className={`rounded-full px-3 py-1.5 font-medium ${
                  subView === tab.id
                    ? "bg-white text-[var(--text)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">대상 월</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="rounded border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {subView === "questions" && <SurveyQuestionsManager campaignKey={yearMonth} />}
      {subView === "responses" && (
        <SurveyResponsesManager campaignKey={yearMonth} projects={projects} />
      )}
      {subView === "summary" && <SurveySummaryView campaignKey={yearMonth} />}
    </div>
  );
}
