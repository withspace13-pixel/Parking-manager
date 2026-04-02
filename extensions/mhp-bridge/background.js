/**
 * 앱 탭 ↔ MHP 탭 메시지 중계
 * (실제 콘솔: https://console.humax-parcs.com/store )
 */

const MHP_URL_HINTS = ["humax-parcs", "humax", "mhp", "hiparking", "hi-parking"];

function mhpTabScore(url) {
  if (!url) return 0;
  const u = url.toLowerCase();
  let s = 0;
  if (u.includes("humax-parcs")) s += 3;
  if (u.includes("/store")) s += 2;
  if (MHP_URL_HINTS.some((h) => u.includes(h))) s += 1;
  return s;
}

function findMhpTabId(tabs, excludeTabId) {
  const candidates = tabs.filter((t) => {
    if (!t.id || !t.url || t.id === excludeTabId) return false;
    if (t.url.startsWith("chrome://") || t.url.startsWith("chrome-extension://") || t.url.startsWith("edge://"))
      return false;
    const u = t.url.toLowerCase();
    if (u.includes("parking-manager") && u.includes("vercel.app")) return false;
    return MHP_URL_HINTS.some((h) => u.includes(h));
  });
  candidates.sort((a, b) => mhpTabScore(b.url) - mhpTabScore(a.url));
  return (candidates.find((t) => t.active) || candidates[0])?.id ?? null;
}

/** @param {"lookup" | "apply" | "credit"} kind */
function injectMhpAndSend(mhpTabId, mhpPayload, appTabId, requestId, kind) {
  const k = kind || "lookup";
  const onSendError = () => {
    deliverToApp(appTabId, {
      requestId,
      ok: false,
      kind: k,
      error:
        k === "credit"
          ? "MHP 탭과 통신하지 못했습니다. MHP를 새로고침하거나 확장을 다시 로드한 뒤, 주차 할인 화면을 연 상태에서 다시 시도하세요. (" +
            (chrome.runtime.lastError?.message || "") +
            ")"
          : "MHP 탭과 통신하지 못했습니다. MHP 페이지를 새로고침하거나 확장을 다시 로드한 뒤, 주차 할인 화면에서 다시 시도하세요. (" +
            (chrome.runtime.lastError?.message || "") +
            ")",
    });
  };

  /** manifest content_script가 이미 있으면 재주입 없이 바로 메시지(수 초 절약) */
  chrome.tabs.sendMessage(mhpTabId, mhpPayload, () => {
    if (!chrome.runtime.lastError) return;
    chrome.scripting.executeScript(
      {
        target: { tabId: mhpTabId },
        files: ["content_script_mhp.js"],
      },
      () => {
        if (chrome.runtime.lastError) {
          deliverToApp(appTabId, {
            requestId,
            ok: false,
            kind: k,
            error:
              "MHP 탭에 스크립트를 넣지 못했습니다. MHP 탭이 열려 있는지 확인하세요. (" +
              chrome.runtime.lastError.message +
              ")",
          });
          return;
        }
        chrome.tabs.sendMessage(mhpTabId, mhpPayload, () => {
          if (chrome.runtime.lastError) onSendError();
        });
      }
    );
  });
}

function deliverToApp(appTabId, payload) {
  if (!appTabId) return;
  const kind =
    payload.kind === "apply" ? "apply" : payload.kind === "credit" ? "credit" : "lookup";
  const innerType =
    kind === "apply" ? "MHP_APPLY_RESPONSE" : kind === "credit" ? "MHP_CREDIT_RESPONSE" : "MHP_LOOKUP_RESPONSE";
  const envelope = {
    type: "MHP_PORT_DELIVER",
    innerType,
    requestId: payload.requestId,
    ok: !!payload.ok,
    parkingTimeText: payload.parkingTimeText ?? "",
    creditText: payload.creditText ?? "",
    error: payload.error ?? "",
    detail: payload.detail ?? "",
  };

  chrome.tabs.sendMessage(appTabId, envelope, () => {
    if (!chrome.runtime.lastError) return;
    chrome.scripting
      .executeScript({
        target: { tabId: appTabId },
        func: (p) => {
          window.postMessage(
            {
              source: "parking-manager-mhp",
              type: p.innerType,
              requestId: p.requestId,
              ok: p.ok,
              parkingTimeText: p.parkingTimeText,
              creditText: p.creditText,
              error: p.error,
              detail: p.detail,
            },
            "*"
          );
        },
        args: [
          {
            innerType: envelope.innerType,
            requestId: envelope.requestId,
            ok: envelope.ok,
            parkingTimeText: envelope.parkingTimeText,
            creditText: envelope.creditText,
            error: envelope.error,
            detail: envelope.detail,
          },
        ],
        world: "MAIN",
      })
      .catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "LOOKUP_FROM_APP") {
    const { requestId, vehicleNum } = msg;
    const appTabId = sender.tab?.id;
    if (!appTabId) {
      sendResponse({ ok: false });
      return false;
    }
    sendResponse({ ok: true });

    chrome.tabs.query({}, (tabs) => {
      const mhpTabId = findMhpTabId(tabs, appTabId);
      if (!mhpTabId) {
        deliverToApp(appTabId, {
          requestId,
          ok: false,
          kind: "lookup",
          error:
            "MHP 콘솔 탭을 찾지 못했습니다. https://console.humax-parcs.com/store 같은 MHP 페이지를 크롬 탭으로 연 뒤 다시 시도하세요.",
        });
        return;
      }
      injectMhpAndSend(
        mhpTabId,
        { type: "EXECUTE_MHP_LOOKUP", vehicleNum, requestId, appTabId },
        appTabId,
        requestId,
        "lookup"
      );
    });
    return false;
  }

  if (msg.type === "APPLY_FROM_APP") {
    const { requestId, vehicleNum, all_day_cnt, cnt_2h, cnt_1h, cnt_30m } = msg;
    const appTabId = sender.tab?.id;
    if (!appTabId) {
      sendResponse({ ok: false });
      return false;
    }
    sendResponse({ ok: true });

    chrome.tabs.query({}, (tabs) => {
      const mhpTabId = findMhpTabId(tabs, appTabId);
      if (!mhpTabId) {
        deliverToApp(appTabId, {
          requestId,
          ok: false,
          kind: "apply",
          error: "MHP 콘솔 탭을 찾지 못했습니다. MHP 탭을 연 뒤 다시 시도하세요.",
        });
        return;
      }
      injectMhpAndSend(
        mhpTabId,
        {
          type: "EXECUTE_MHP_APPLY",
          requestId,
          appTabId,
          vehicleNum,
          all_day_cnt: Number(all_day_cnt) || 0,
          cnt_2h: Number(cnt_2h) || 0,
          cnt_1h: Number(cnt_1h) || 0,
          cnt_30m: Number(cnt_30m) || 0,
        },
        appTabId,
        requestId,
        "apply"
      );
    });
    return false;
  }

  if (msg.type === "CREDIT_FROM_APP") {
    const { requestId } = msg;
    const appTabId = sender.tab?.id;
    if (!appTabId) {
      sendResponse({ ok: false });
      return false;
    }
    sendResponse({ ok: true });

    chrome.tabs.query({}, (tabs) => {
      const mhpTabId = findMhpTabId(tabs, appTabId);
      if (!mhpTabId) {
        deliverToApp(appTabId, {
          requestId,
          ok: false,
          kind: "credit",
          error:
            "MHP 콘솔 탭을 찾지 못했습니다. 스토어 크레딧을 보려면 MHP 페이지 탭을 연 뒤 다시 시도하세요.",
        });
        return;
      }
      injectMhpAndSend(
        mhpTabId,
        { type: "EXECUTE_MHP_CREDIT", requestId, appTabId },
        appTabId,
        requestId,
        "credit"
      );
    });
    return false;
  }

  if (msg.type === "MHP_LOOKUP_RESULT") {
    const { appTabId, requestId, ok, parkingTimeText, error } = msg;
    deliverToApp(appTabId, {
      requestId,
      ok: !!ok,
      kind: "lookup",
      parkingTimeText: parkingTimeText ?? "",
      error,
    });
    return false;
  }

  if (msg.type === "MHP_APPLY_RESULT") {
    const { appTabId, requestId, ok, error, detail } = msg;
    deliverToApp(appTabId, {
      requestId,
      ok: !!ok,
      kind: "apply",
      error: error ?? "",
      detail: detail ?? "",
    });
    return false;
  }

  if (msg.type === "MHP_CREDIT_RESULT") {
    const { appTabId, requestId, ok, creditText, error } = msg;
    deliverToApp(appTabId, {
      requestId,
      ok: !!ok,
      kind: "credit",
      creditText: creditText ?? "",
      error: error ?? "",
    });
    return false;
  }

  return false;
});
