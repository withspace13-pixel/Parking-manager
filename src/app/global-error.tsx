"use client";

/**
 * 루트 레이아웃까지 실패할 때 사용. html/body 필수.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errorjs
 */
export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ backgroundColor: "#F8FAFC", color: "#1E293B", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ padding: "2rem", textAlign: "center", maxWidth: "28rem", margin: "4rem auto" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>심각한 오류</h2>
          <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#64748B" }}>
            개발 서버를 중지한 뒤 프로젝트 폴더에서 <code>npm run dev:clean</code> 을 실행하세요.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.75rem",
              background: "#2563EB",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
