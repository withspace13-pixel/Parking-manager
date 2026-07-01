// 솔라피 충전 잔액 조회
import { useCallback, useEffect, useState } from "react";

export const SOLAPI_BALANCE_POLL_MS = 60_000;

export function formatSolapiBalanceDisplay(balance: number, point: number): string {
  const cash = `${Math.round(balance).toLocaleString("ko-KR")}원`;
  if (point > 0) {
    return `${cash} · P ${Math.round(point).toLocaleString("ko-KR")}`;
  }
  return cash;
}

export function useSolapiBalance() {
  const [display, setDisplay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetch("/api/messages/balance", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          configured?: boolean;
          balance?: number;
          point?: number;
          error?: string;
        };

        if (!data.configured) {
          setConfigured(false);
          setDisplay(null);
          setError(null);
          return;
        }

        setConfigured(true);

        if (!res.ok || data.error) {
          setError(data.error ?? "잔액 조회에 실패했습니다.");
          return;
        }

        setDisplay(formatSolapiBalanceDisplay(data.balance ?? 0, data.point ?? 0));
        setError(null);
      })
      .catch(() => {
        setError("잔액 조회에 실패했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, SOLAPI_BALANCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { display, error, loading, configured, refresh };
}
