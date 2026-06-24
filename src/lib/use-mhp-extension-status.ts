// MHP 브리지 확장 설치·버전 상태를 주기적으로 확인하는 훅
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isMhpPingResponse, postMhpPingRequest } from "@/lib/mhp-extension";
import {
  MHP_EXTENSION_REQUIRED_VERSION,
  isExtensionVersionUpToDate,
} from "@/lib/mhp-extension-version";

export const MHP_EXTENSION_PING_TIMEOUT_MS = 900;

export type MhpExtensionStatus =
  | { state: "checking" }
  | { state: "connected"; version: string }
  | { state: "missing"; hint: string }
  | { state: "outdated"; version: string; requiredVersion: string };

const MISSING_HINT =
  "확장이 없거나 이 탭을 새로고침(F5) 해야 합니다. chrome://extensions 에서「Parking Manager ↔ MHP」를 켠 뒤, extensions/mhp-bridge 폴더를 로드했는지 확인하세요.";

const OUTDATED_HINT =
  "chrome://extensions 에서 확장「새로고침」 후 이 페이지도 F5로 새로고침하세요.";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mhp-ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useMhpExtensionStatus() {
  const [status, setStatus] = useState<MhpExtensionStatus>({ state: "checking" });
  const pingTokenRef = useRef(0);

  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    const token = ++pingTokenRef.current;
    setStatus({ state: "checking" });

    const requestId = newRequestId();
    const onMsg = (event: MessageEvent) => {
      if (event.source !== window || !isMhpPingResponse(event.data)) return;
      if (event.data.requestId !== requestId) return;
      if (token !== pingTokenRef.current) return;

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMsg);

      const version = String(event.data.version ?? "").trim();
      if (!event.data.ok || !version) {
        setStatus({ state: "missing", hint: MISSING_HINT });
        return;
      }
      if (!isExtensionVersionUpToDate(version)) {
        setStatus({
          state: "outdated",
          version,
          requiredVersion: MHP_EXTENSION_REQUIRED_VERSION,
        });
        return;
      }
      setStatus({ state: "connected", version });
    };

    const timeoutId = window.setTimeout(() => {
      if (token !== pingTokenRef.current) return;
      window.removeEventListener("message", onMsg);
      setStatus({ state: "missing", hint: MISSING_HINT });
    }, MHP_EXTENSION_PING_TIMEOUT_MS);

    window.addEventListener("message", onMsg);
    postMhpPingRequest(requestId);
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      pingTokenRef.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { status, refresh, missingHint: MISSING_HINT, outdatedHint: OUTDATED_HINT };
}
