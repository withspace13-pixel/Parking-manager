"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8FAFC] px-6 text-center">
      <h2 className="text-lg font-semibold text-[#1E293B]">문제가 발생했습니다</h2>
      <p className="max-w-md text-sm text-[#64748B]">
        개발 중에는 <code className="rounded bg-slate-200 px-1">.next</code> 캐시가 깨지면 이런 화면이 날 수 있습니다. 터미널에서 서버를 끄고{" "}
        <code className="rounded bg-slate-200 px-1">npm run dev:clean</code> 을 실행해 보세요.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1D4ED8]"
      >
        다시 시도
      </button>
    </div>
  );
}
