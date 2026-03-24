"use client";

import { useEffect, useState } from "react";

/**
 * 개발 모드에서 Tailwind 유틸리티가 적용되지 않으면(스타일 청크 누락 등) 상단에 안내 배너 표시.
 * 운영 빌드에서는 렌더하지 않음.
 */
export function DevCssHealthCheck() {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const el = document.createElement("div");
    el.setAttribute("data-css-probe", "1");
    el.className = "hidden";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    const display = window.getComputedStyle(el).display;
    document.body.removeChild(el);
    if (display !== "none") setBroken(true);
  }, []);

  if (!broken) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "#FEF3C7",
        borderBottom: "1px solid #F59E0B",
        padding: "10px 16px",
        fontSize: 13,
        color: "#92400E",
        lineHeight: 1.5,
      }}
    >
      <strong>스타일이 로드되지 않은 것 같습니다.</strong> 개발 서버를 끄고(Ctrl+C) 프로젝트에서{" "}
      <code style={{ background: "#FDE68A", padding: "2px 6px", borderRadius: 4 }}>npm run dev:clean</code> 을 실행한 뒤
      브라우저를 강력 새로고침(Ctrl+Shift+R) 해 보세요. (Windows에서 .next 캐시가 깨질 때 자주 발생합니다.)
    </div>
  );
}
