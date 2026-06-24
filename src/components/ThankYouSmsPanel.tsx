"use client";

// 감사문자 수동 발송 화면 껍데기 (솔라피 연동 전)
import type { Project } from "@/lib/supabase";
import { MessageCircle } from "lucide-react";

type Props = {
  projects: Project[];
};

export function ThankYouSmsPanel({ projects }: Props) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF2FF]">
        <MessageCircle className="h-7 w-7 text-[var(--primary)]" />
      </div>
      <h3 className="text-lg font-bold text-[var(--text)]">감사문자</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
        행사 종료 다음날 오전에 보내는 감사 문자를 여기서 미리보기·수동 발송할 예정입니다.
        <br />
        (등록된 행사 {projects.length}건 · 솔라피 연동 전)
      </p>
      <p className="mt-6 text-xs text-[var(--text-muted)]">만족도 조사 탭과 별도로 관리됩니다.</p>
    </div>
  );
}
