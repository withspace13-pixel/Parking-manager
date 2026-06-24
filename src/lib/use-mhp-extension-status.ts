// MHP 브리지 확장 설치·버전 상태를 주기적으로 확인하는 훅
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isMhpPingResponse, postMhpPingRequest } from "@/lib/mhp-extension";
import {
  MHP_EXTENSION_REQUIRED_VERSION,
  isExtensionVersionUpToDate,
} from "@/lib/mhp-extension-version";

export const MHP_EXTENSION_PING_TIMEOUT_MS = 1500;

/** content script 주입 대기 — 초기 로드 시 순차 재시도 간격(ms) */
const INITIAL_PROBE_DELAYS_MS = [0, 350, 800, 1500, 2800, 4500];

/** 확장 없음 표시 후에도 자동 재시도 */
const BACKGROUND_PROBE_INTERVAL_MS = 10_000;

export type MhpExtensionStatus =
  | { state: "checking" }
  | { state: "connected"; version: string }
  | { state: "missing"; hint: string }
  | { state: "outdated"; version: string; requiredVersion: string };

const MISSING_HINT =
  "확장이 없거나 이 탭을 새로고침(F5) 해야 합니다. chrome://extensions 에서「Parking Manager ↔ MHP」를 켠 뒤, extensions/mhp-bridge 폴더를 로드했는지 확인하세요.";

const OUTDATED_HINT =
  "chrome://extensions 에서 확장「새로고침」 후 이 페이지도 F5로 새로고침하세요.";

type PingResult =
  | { kind: "connected"; version: string }
  | { kind: "outdated"; version: string }
  | { kind: "missing" };

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mhp-ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function pingExtensionOnce(timeoutMs: number): Promise<PingResult> {
  return new Promise((resolve) => {
    const requestId = newRequestId();

    const onMsg = (event: MessageEvent) => {
      if (event.source !== window || !isMhpPingResponse(event.data)) return;
      if (event.data.requestId !== requestId) return;

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMsg);

      const version = String(event.data.version ?? "").trim();
      if (!event.data.ok || !version) {
        resolve({ kind: "missing" });
        return;
      }
      if (!isExtensionVersionUpToDate(version)) {
        resolve({ kind: "outdated", version });
        return;
      }
      resolve({ kind: "connected", version });
    };

    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve({ kind: "missing" });
    }, timeoutMs);

    window.addEventListener("message", onMsg);
    postMhpPingRequest(requestId);
  });
}

function applyPingResult(result: PingResult): MhpExtensionStatus {
  if (result.kind === "connected") {
    return { state: "connected", version: result.version };
  }
  if (result.kind === "outdated") {
    return {
      state: "outdated",
      version: result.version,
      requiredVersion: MHP_EXTENSION_REQUIRED_VERSION,
    };
  }
  return { state: "missing", hint: MISSING_HINT };
}

export function useMhpExtensionStatus() {
  const [status, setStatus] = useState<MhpExtensionStatus>({ state: "checking" });
  const probeTokenRef = useRef(0);

  const runProbe = useCallback(
    async (options?: { delays?: number[]; showChecking?: boolean }) => {
      if (typeof window === "undefined") return;

      const delays = options?.delays ?? INITIAL_PROBE_DELAYS_MS;
      const showChecking = options?.showChecking ?? true;
      const token = ++probeTokenRef.current;

      if (showChecking) {
        setStatus({ state: "checking" });
      }

      for (let i = 0; i < delays.length; i++) {
        if (token !== probeTokenRef.current) return;
        if (i > 0) await sleep(delays[i]!);

        const result = await pingExtensionOnce(MHP_EXTENSION_PING_TIMEOUT_MS);
        if (token !== probeTokenRef.current) return;

        if (result.kind !== "missing") {
          setStatus(applyPingResult(result));
          return;
        }
      }

      if (token === probeTokenRef.current) {
        setStatus({ state: "missing", hint: MISSING_HINT });
      }
    },
    []
  );

  const refresh = useCallback(() => {
    void runProbe({ delays: INITIAL_PROBE_DELAYS_MS, showChecking: true });
  }, [runProbe]);

  useEffect(() => {
    void runProbe({ delays: INITIAL_PROBE_DELAYS_MS, showChecking: true });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runProbe({ delays: [0, 500, 1200], showChecking: false });
      }
    };
    const onFocus = () => {
      void runProbe({ delays: [0, 500, 1200], showChecking: false });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      probeTokenRef.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [runProbe]);

  useEffect(() => {
    if (status.state !== "missing") return;

    const id = window.setInterval(() => {
      void runProbe({ delays: [0, 600, 1400], showChecking: false });
    }, BACKGROUND_PROBE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [status.state, runProbe]);

  return { status, refresh, missingHint: MISSING_HINT, outdatedHint: OUTDATED_HINT };
}
