/** 크롬 확장(content_script_app)과 동일한 계약 — window.postMessage 로 통신 */

export const MHP_EXTENSION_MSG_SOURCE = "parking-manager-mhp" as const;

export type MhpLookupRequestPayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_LOOKUP_REQUEST";
  requestId: string;
  vehicleNum: string;
};

export type MhpLookupResponsePayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_LOOKUP_RESPONSE";
  requestId: string;
  ok: boolean;
  parkingTimeText?: string;
  /** MHP 「할인 적용 내역」에서 적용 취소가 아닌 건만 집계한 안내 문구(없으면 빈 문자열) */
  appliedDiscountsSummary?: string;
  /** MHP 현재 미사용 할인 수량(권종별). 조회 시 앱 표 동기화에 사용 */
  appliedDiscountCounts?: { all_day_cnt: number; "2h_cnt": number; "1h_cnt": number; "30m_cnt": number } | null;
  error?: string;
};

export type MhpApplyRequestPayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_APPLY_REQUEST";
  requestId: string;
  vehicleNum: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
};

export type MhpApplyResponsePayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_APPLY_RESPONSE";
  requestId: string;
  ok: boolean;
  error?: string;
  detail?: string;
};

export type MhpSyncRequestPayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_SYNC_REQUEST";
  requestId: string;
  vehicleNum: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
};

export type MhpSyncResponsePayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_SYNC_RESPONSE";
  requestId: string;
  ok: boolean;
  error?: string;
  detail?: string;
  diff?: { cancelled?: number; added?: number } | null;
};

export type MhpCancelAllRequestPayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_CANCEL_ALL_REQUEST";
  requestId: string;
  vehicleNum: string;
};

export type MhpCancelAllResponsePayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_CANCEL_ALL_RESPONSE";
  requestId: string;
  ok: boolean;
  error?: string;
  detail?: string;
};

export type MhpCreditRequestPayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_CREDIT_REQUEST";
  requestId: string;
};

export type MhpCreditResponsePayload = {
  source: typeof MHP_EXTENSION_MSG_SOURCE;
  type: "MHP_CREDIT_RESPONSE";
  requestId: string;
  ok: boolean;
  creditText?: string;
  error?: string;
};

export function postMhpLookupRequest(vehicleNum: string, requestId: string): void {
  if (typeof window === "undefined") return;
  const payload: MhpLookupRequestPayload = {
    source: MHP_EXTENSION_MSG_SOURCE,
    type: "MHP_LOOKUP_REQUEST",
    requestId,
    vehicleNum,
  };
  window.postMessage(payload, "*");
}

export function postMhpApplyRequest(
  requestId: string,
  vehicleNum: string,
  counts: { all_day_cnt: number; "2h_cnt": number; "1h_cnt": number; "30m_cnt": number }
): void {
  if (typeof window === "undefined") return;
  const payload: MhpApplyRequestPayload = {
    source: MHP_EXTENSION_MSG_SOURCE,
    type: "MHP_APPLY_REQUEST",
    requestId,
    vehicleNum,
    all_day_cnt: counts.all_day_cnt,
    "2h_cnt": counts["2h_cnt"],
    "1h_cnt": counts["1h_cnt"],
    "30m_cnt": counts["30m_cnt"],
  };
  window.postMessage(payload, "*");
}

export function postMhpSyncRequest(
  requestId: string,
  vehicleNum: string,
  counts: { all_day_cnt: number; "2h_cnt": number; "1h_cnt": number; "30m_cnt": number }
): void {
  if (typeof window === "undefined") return;
  const payload: MhpSyncRequestPayload = {
    source: MHP_EXTENSION_MSG_SOURCE,
    type: "MHP_SYNC_REQUEST",
    requestId,
    vehicleNum,
    all_day_cnt: counts.all_day_cnt,
    "2h_cnt": counts["2h_cnt"],
    "1h_cnt": counts["1h_cnt"],
    "30m_cnt": counts["30m_cnt"],
  };
  window.postMessage(payload, "*");
}

export function postMhpCancelAllRequest(requestId: string, vehicleNum: string): void {
  if (typeof window === "undefined") return;
  const payload: MhpCancelAllRequestPayload = {
    source: MHP_EXTENSION_MSG_SOURCE,
    type: "MHP_CANCEL_ALL_REQUEST",
    requestId,
    vehicleNum,
  };
  window.postMessage(payload, "*");
}

export function isMhpLookupResponse(data: unknown): data is MhpLookupResponsePayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as MhpLookupResponsePayload;
  return d.source === MHP_EXTENSION_MSG_SOURCE && d.type === "MHP_LOOKUP_RESPONSE";
}

export function isMhpApplyResponse(data: unknown): data is MhpApplyResponsePayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as MhpApplyResponsePayload;
  return d.source === MHP_EXTENSION_MSG_SOURCE && d.type === "MHP_APPLY_RESPONSE";
}

export function isMhpSyncResponse(data: unknown): data is MhpSyncResponsePayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as MhpSyncResponsePayload;
  return d.source === MHP_EXTENSION_MSG_SOURCE && d.type === "MHP_SYNC_RESPONSE";
}

export function isMhpCancelAllResponse(data: unknown): data is MhpCancelAllResponsePayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as MhpCancelAllResponsePayload;
  return d.source === MHP_EXTENSION_MSG_SOURCE && d.type === "MHP_CANCEL_ALL_RESPONSE";
}

export function postMhpCreditRequest(requestId: string): void {
  if (typeof window === "undefined") return;
  const payload: MhpCreditRequestPayload = {
    source: MHP_EXTENSION_MSG_SOURCE,
    type: "MHP_CREDIT_REQUEST",
    requestId,
  };
  window.postMessage(payload, "*");
}

export function isMhpCreditResponse(data: unknown): data is MhpCreditResponsePayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as MhpCreditResponsePayload;
  return d.source === MHP_EXTENSION_MSG_SOURCE && d.type === "MHP_CREDIT_RESPONSE";
}

/** 확장에서 오는 `입차일시 … · 주차시간 …` 문자열을 두 칸용으로 분리 */
export function splitMhpParkingDisplayText(text: string): { entryAt: string; duration: string } {
  const t = String(text ?? "").trim();
  if (!t) return { entryAt: "", duration: "" };

  let entryAt = "";
  let duration = "";
  for (const part of t.split(/\s*·\s*/)) {
    const p = part.trim();
    if (p.startsWith("입차일시")) {
      entryAt = p.replace(/^입차일시\s*/, "").trim();
    } else if (p.startsWith("주차시간")) {
      duration = p.replace(/^주차시간\s*/, "").trim();
    }
  }

  if (!entryAt && !duration) {
    return { entryAt: t, duration: "" };
  }
  return { entryAt, duration };
}
