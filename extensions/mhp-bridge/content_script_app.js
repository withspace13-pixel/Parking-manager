(function () {
  const SOURCE = "parking-manager-mhp";

  function replyLookupError(requestId, message) {
    window.postMessage(
      { source: SOURCE, type: "MHP_LOOKUP_RESPONSE", requestId, ok: false, error: message },
      "*"
    );
  }

  function replyApplyError(requestId, message) {
    window.postMessage(
      { source: SOURCE, type: "MHP_APPLY_RESPONSE", requestId, ok: false, error: message },
      "*"
    );
  }

  function replyCreditError(requestId, message) {
    window.postMessage(
      { source: SOURCE, type: "MHP_CREDIT_RESPONSE", requestId, ok: false, error: message, creditText: "" },
      "*"
    );
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== SOURCE) return;

    if (d.type === "MHP_LOOKUP_REQUEST") {
      try {
        if (!chrome.runtime?.id) {
          replyLookupError(
            d.requestId,
            "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 조회하세요."
          );
          return;
        }
        chrome.runtime.sendMessage(
          {
            type: "LOOKUP_FROM_APP",
            requestId: d.requestId,
            vehicleNum: String(d.vehicleNum || "").replace(/\D/g, "").slice(0, 4),
          },
          () => {
            const err = chrome.runtime.lastError;
            if (!err) return;
            const m = err.message || "";
            const invalidated = /invalidated|Extension context/i.test(m);
            replyLookupError(
              d.requestId,
              invalidated
                ? "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 조회하세요."
                : m || "확장 프로그램 통신 오류"
            );
          }
        );
      } catch (_) {
        replyLookupError(
          d.requestId,
          "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 조회하세요."
        );
      }
      return;
    }

    if (d.type === "MHP_APPLY_REQUEST") {
      try {
        if (!chrome.runtime?.id) {
          replyApplyError(
            d.requestId,
            "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 등록하세요."
          );
          return;
        }
        chrome.runtime.sendMessage(
          {
            type: "APPLY_FROM_APP",
            requestId: d.requestId,
            vehicleNum: String(d.vehicleNum || "").replace(/\D/g, "").slice(0, 4),
            all_day_cnt: Number(d.all_day_cnt) || 0,
            cnt_2h: Number(d["2h_cnt"]) || 0,
            cnt_1h: Number(d["1h_cnt"]) || 0,
            cnt_30m: Number(d["30m_cnt"]) || 0,
          },
          () => {
            const err = chrome.runtime.lastError;
            if (!err) return;
            const m = err.message || "";
            const invalidated = /invalidated|Extension context/i.test(m);
            replyApplyError(
              d.requestId,
              invalidated
                ? "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 등록하세요."
                : m || "확장 프로그램 통신 오류"
            );
          }
        );
      } catch (_) {
        replyApplyError(
          d.requestId,
          "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 등록하세요."
        );
      }
      return;
    }

    if (d.type === "MHP_CREDIT_REQUEST") {
      try {
        if (!chrome.runtime?.id) {
          replyCreditError(
            d.requestId,
            "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 시도하세요."
          );
          return;
        }
        chrome.runtime.sendMessage(
          { type: "CREDIT_FROM_APP", requestId: d.requestId },
          () => {
            const err = chrome.runtime.lastError;
            if (!err) return;
            const m = err.message || "";
            const invalidated = /invalidated|Extension context/i.test(m);
            replyCreditError(
              d.requestId,
              invalidated
                ? "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 시도하세요."
                : m || "확장 프로그램 통신 오류"
            );
          }
        );
      } catch (_) {
        replyCreditError(
          d.requestId,
          "확장 프로그램을 방금 다시 로드했습니다. 이 탭을 새로고침(F5)한 뒤 다시 시도하세요."
        );
      }
      return;
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "MHP_PORT_DELIVER") return;
    try {
      window.postMessage(
        {
          source: SOURCE,
          type: msg.innerType,
          requestId: msg.requestId,
          ok: !!msg.ok,
          parkingTimeText: msg.parkingTimeText,
          creditText: msg.creditText ?? "",
          error: msg.error,
          detail: msg.detail,
        },
        "*"
      );
    } catch (_) {}
  });
})();
