// MHP 스토어 크레딧 잔액 조회(확장 프로그램 연동)
import { useCallback, useEffect, useRef, useState } from "react";
import { isMhpCreditResponse, postMhpCreditRequest } from "@/lib/mhp-extension";

export const MHP_CREDIT_POLL_MS = 40_000;
export const MHP_CREDIT_TIMEOUT_MS = 22_000;

export function useMhpStoreCredit() {
  const pendingRef = useRef<string | null>(null);
  const [display, setDisplay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `mhp-credit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingRef.current = requestId;
    setLoading(true);
    postMhpCreditRequest(requestId);
    window.setTimeout(() => {
      if (pendingRef.current !== requestId) return;
      pendingRef.current = null;
      setLoading(false);
      setError("크레딧 응답이 없습니다. MHP 탭·확장을 확인하세요.");
    }, MHP_CREDIT_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const onCredit = (e: MessageEvent) => {
      if (e.source !== window || !isMhpCreditResponse(e.data)) return;
      if (pendingRef.current !== e.data.requestId) return;
      pendingRef.current = null;
      setLoading(false);
      if (e.data.ok && (e.data.creditText ?? "").trim()) {
        setDisplay((e.data.creditText ?? "").trim());
        setError(null);
      } else {
        setError(e.data.error?.trim() || "스토어 크레딧을 불러오지 못했습니다.");
      }
    };
    window.addEventListener("message", onCredit);
    return () => window.removeEventListener("message", onCredit);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, MHP_CREDIT_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { display, error, loading, refresh };
}
