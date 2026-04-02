(function () {
  try {
    if (globalThis.__PM_MHP_BRIDGE_V1__) return;
    globalThis.__PM_MHP_BRIDGE_V1__ = true;
  } catch (_) {
    return;
  }

  const CAR_INPUT_SELECTORS = [
    'input[placeholder*="4자리"]',
    'input[placeholder*="차량번호"]',
    "#car_input",
    'input[id*="car" i]',
    'input[name*="car" i]',
    'input[name*="vehicle" i]',
    'input[placeholder*="차량" i]',
    'input[placeholder*="번호" i]',
    'input[inputmode="numeric"][maxlength="4"]',
  ];

  /**
   * 백그라운드 탭: rAF·짧은 setTimeout이 멈추거나 1초 단위로 쓰로틀됨.
   * 4자리는 한 이벤트 루프 턴 안에서 동기로 넣고, 마지막에 setTimeout(0) 한 번만 사용.
   */
  /** 결과 폴링(백그라운드에서는 브라우저가 간격을 늘릴 수 있음) */
  const POLL_MS = 10;
  /** 이전과 동일한 화면에서 재조회할 때만 의미 있는 최소 대기 */
  const SAME_RESULT_MIN_MS = 90;
  const MAX_WAIT_MS = 22000;
  /** 차량 미존재·무응답 시 조회 버튼 로딩이 길어지지 않도록 상한 */
  const LOOKUP_NO_RESULT_MS = 4000;
  const STABLE_NEED = 1;
  /** 첫 유효 결과 직후 너무 이르게 끊기지 않게 하는 최소 경과(ms) */
  const STABLE_MIN_ELAPSED_MS = 16;

  const ENTRY_RE = /([0-9]{4}\.[0-9]{2}\.[0-9]{2}\s*\([^)]+\)\s*\d{1,2}:\d{2})/;

  function durationCompact(s) {
    return String(s || "").replace(/\s/g, "");
  }

  function isValidDuration(d) {
    const c = durationCompact(d);
    return /^(\d+시간\d+분|\d+시간|\d{1,4}분)$/.test(c);
  }

  function findCarInput() {
    for (const sel of CAR_INPUT_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return el;
      } catch (_) {}
    }
    return null;
  }

  function setInputValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
  }

  function findVehicleInfoBlock() {
    let best = null;
    let bestSize = Infinity;
    const nodes = document.querySelectorAll("div, section, article, li, td");
    const limit = Math.min(nodes.length, 2000);
    for (let i = 0; i < limit; i++) {
      const el = nodes[i];
      const t = el.innerText || "";
      const len = t.length;
      if (len < 20 || len > 1400) continue;
      if ((!t.includes("입차일시") && !t.includes("입차 일시")) || !t.includes("주차시간")) continue;
      const tickets = (t.match(/할인권/g) || []).length;
      if (tickets >= 5 && len > 700) continue;
      if (len < bestSize) {
        bestSize = len;
        best = el;
      }
    }
    return best;
  }

  /**
   * 조회 직후 이전 차량 입차정보 DOM이 남아 있으면 같은 텍스트를 또 읽는 문제 방지.
   * 입차 정보 블록 또는 상단에 조회한 4자리 번호가 보일 때만 성공으로 인정.
   */
  function mhpUiShowsLookupVehicleDigits(digits) {
    const d = String(digits || "").replace(/\D/g, "").slice(0, 4);
    if (d.length !== 4) return true;
    const scope = findVehicleInfoBlock();
    const scopeFlat = scope ? (scope.innerText || "").replace(/\s/g, "") : "";
    if (scopeFlat.length > 15 && scopeFlat.includes(d)) return true;
    const headFlat = (document.body?.innerText || "").slice(0, 3500).replace(/\s/g, "");
    return headFlat.includes(d) && /입차일시|입차\s*일시/.test(headFlat);
  }

  function normSpaces(s) {
    return String(s || "")
      .replace(/\r/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatDurationDisp(d) {
    const c = durationCompact(d);
    return c.replace(/(\d+시간)(\d+분)/, "$1 $2");
  }

  function applyStopRe(s, stopRe) {
    if (!s) return "";
    if (!stopRe) return normSpaces(s);
    return normSpaces(String(s).split(stopRe)[0].trim());
  }

  /**
   * MHP pill 라벨(회색 뱃지) 옆·옆 칸·같은 줄에 붙은 값만 가져옴.
   * (표 dt/dd가 아닌 flex 한 줄 레이아웃 대응)
   */
  function extractInlineTailAfterLabel(label, stopRe) {
    const nodes = document.querySelectorAll("span, div, label, button, p, strong, em, b, i, td, th");
    for (const el of nodes) {
      const t = normSpaces(el.textContent || "");
      if (t !== label) continue;
      if (el.querySelectorAll("span, div, label").length > 6) continue;

      const parts = [];
      for (let n = el.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType === 3) parts.push(n.textContent || "");
        else if (n.nodeType === 1) parts.push(n.textContent || "");
      }
      let merged = normSpaces(parts.join(" "));
      merged = applyStopRe(merged, stopRe);
      if (merged) return merged;

      const par = el.parentElement;
      if (par) {
        const pNext = par.nextElementSibling;
        if (pNext) {
          let m = normSpaces(pNext.innerText || "");
          m = applyStopRe(m, stopRe);
          if (m) return m;
        }
        let full = normSpaces(par.innerText || "");
        const idx = full.indexOf(label);
        if (idx >= 0) {
          let after = full.slice(idx + label.length).trim().replace(/^[：:\s]+/, "");
          after = applyStopRe(after, stopRe);
          if (after) return after;
        }
      }
    }
    return "";
  }

  function extractMhpPillRowInfo() {
    let entry = "";
    for (const lab of ["입차일시", "입차 일시"]) {
      const tail = extractInlineTailAfterLabel(lab, /\s*주차시간\b/);
      if (tail) {
        const em = tail.match(ENTRY_RE);
        if (em) {
          entry = em[1].trim();
          break;
        }
      }
    }
    const tailD = extractInlineTailAfterLabel("주차시간", /\s*(?:입차일시|입차 일시)\b/);
    const duration = tailD ? parseParkingDurationFromLabeledValue(tailD, true) : "";
    return { entry, duration };
  }

  /** 할인권 단위(30·60·120분)와 같은 "분만" 값은 신뢰 경로가 아니면 주차시간으로 쓰지 않음 */
  function isTicketLikeMinutesOnlyDuration(v) {
    const c = durationCompact(v);
    return /^(30|60|120)분$/.test(c);
  }

  /**
   * MHP 「주차시간」 칸에만 해당하는 문자열에서 기간 추출.
   * @param allowTicketMinuteOnly pill·표 옆 칸 등 라벨 전용 값일 때만 true (30·60·120분 단독 허용)
   */
  function parseParkingDurationFromLabeledValue(raw, allowTicketMinuteOnly) {
    if (!raw) return "";
    let s = normSpaces(raw);
    if (!s) return "";
    if (/할인권|할인\s*\(|남은\s*할인|잔여\s*할인/.test(s)) {
      s = s.split(/\s*할인/)[0].trim();
    }
    const hm = s.match(/^(\d+시간\s*\d+분|\d+시간)(?=\s|$)/);
    if (hm) {
      const d = hm[1].replace(/\s+/g, " ").trim();
      return isValidDuration(d) ? formatDurationDisp(d) : "";
    }
    const mm = s.match(/^(\d{1,4})분(?=\s|$)/);
    if (mm) {
      const rest = s.slice(mm[0].length).trim();
      if (/할인|권|당일|매|장/.test(rest)) return "";
      const d = mm[1] + "분";
      if (!allowTicketMinuteOnly && isTicketLikeMinutesOnlyDuration(d)) return "";
      return isValidDuration(d) ? formatDurationDisp(d) : "";
    }
    return "";
  }

  /** 본문에서 「주차시간」과 같은 줄·근처의 N시간 M분만 직접 캡처 (할인 줄보다 우선) */
  function parseDurationPreferHoursAfterLabel(text) {
    if (!text) return "";
    const t = text.replace(/\r/g, "");
    const m1 = t.match(/주차\s*시간\s*[：:\s]+(\d+\s*시간\s*\d+\s*분)/);
    if (m1) {
      const d = normSpaces(m1[1]);
      return isValidDuration(d) ? formatDurationDisp(d) : "";
    }
    const m2 = t.match(/주차\s*시간\s*[：:\s]+(\d+\s*시간)(?!\s*\d+\s*분)/);
    if (m2) {
      const d = normSpaces(m2[1]);
      return isValidDuration(d) ? formatDurationDisp(d) : "";
    }
    return "";
  }

  function extractParkingDurationFromDom() {
    const tryVal = (node) => {
      if (!node) return "";
      return parseParkingDurationFromLabeledValue(node.innerText || node.textContent || "", true);
    };

    for (const dt of document.querySelectorAll("dt, th")) {
      const lab = normSpaces(dt.textContent);
      if (lab !== "주차시간") continue;
      const v = tryVal(dt.nextElementSibling);
      if (v) return v;
    }

    for (const tr of document.querySelectorAll("tr")) {
      const cells = tr.querySelectorAll("th, td");
      for (let i = 0; i < cells.length - 1; i++) {
        const a = normSpaces(cells[i].textContent);
        if (a !== "주차시간") continue;
        const v = tryVal(cells[i + 1]);
        if (v) return v;
      }
    }

    for (const el of document.querySelectorAll("div, span, li, p, label")) {
      const t = normSpaces(el.innerText || "");
      if (!t.startsWith("주차시간")) continue;
      if (t.length > 100) continue;
      if (/30분\s*할인|할인권/.test(t) && !/\d+\s*시간/.test(t)) continue;
      const m = t.match(/^주차시간\s*[：:]*\s*(.+)$/);
      if (m) {
        const v = parseParkingDurationFromLabeledValue(m[1], false);
        if (v) return v;
      }
    }

    return "";
  }

  function extractEntryFromDom() {
    for (const dt of document.querySelectorAll("dt, th")) {
      const lab = normSpaces(dt.textContent);
      if (lab !== "입차일시" && lab !== "입차 일시") continue;
      const sib = dt.nextElementSibling;
      if (!sib) continue;
      const text = normSpaces(sib.textContent || "");
      const em = text.match(ENTRY_RE);
      if (em) return em[1].trim();
    }

    for (const tr of document.querySelectorAll("tr")) {
      const cells = tr.querySelectorAll("th, td");
      for (let i = 0; i < cells.length - 1; i++) {
        const a = normSpaces(cells[i].textContent);
        if (a !== "입차일시" && a !== "입차 일시") continue;
        const b = normSpaces(cells[i + 1].textContent || "");
        const em = b.match(ENTRY_RE);
        if (em) return em[1].trim();
      }
    }

    return "";
  }

  function durationCandidateScore(v) {
    if (!v) return -1;
    const c = durationCompact(v);
    if (/^\d+시간\d+분$/.test(c)) return 4;
    if (/^\d+시간$/.test(c)) return 2;
    if (/^\d{1,4}분$/.test(c)) return 0;
    return 1;
  }

  function parseDurationFromRawStrict(text) {
    if (!text) return "";
    const lines = text.replace(/\r/g, "").split("\n");
    const candidates = [];
    for (const line of lines) {
      const L = line.trim();
      if (!L.includes("주차시간")) continue;
      if (/30분\s*할인|할인권/.test(L) && !/\d+\s*시간/.test(L)) continue;
      const m = L.match(/주차시간\s*[：:]*\s*(.+)/);
      if (!m) continue;
      const v = parseParkingDurationFromLabeledValue(m[1], false);
      if (v) candidates.push({ v, score: durationCandidateScore(v) });
    }
    const m = text.replace(/\r/g, "").match(/주차시간\s*[：:]*\s*([^\n]+)/);
    if (m) {
      const v = parseParkingDurationFromLabeledValue(m[1], false);
      if (v) candidates.push({ v, score: durationCandidateScore(v) });
    }
    const filtered = candidates.filter((c) => !isTicketLikeMinutesOnlyDuration(c.v));
    if (!filtered.length) return "";
    filtered.sort((a, b) => b.score - a.score);
    return filtered[0]?.v || "";
  }

  function parseEntryFromRaw(text) {
    if (!text) return "";
    const t = text.replace(/\r/g, "");
    const lines = t.split("\n").map((l) => l.trim());
    for (const line of lines) {
      if (!line.includes("입차일시") && !line.includes("입차 일시")) continue;
      const m = line.match(/입차\s*일시\s*[：:]*\s*(.+)/);
      if (m) {
        const chunk = m[1].trim().split(/\s{2,}|(?=주차시간)/)[0];
        const em = chunk.match(ENTRY_RE);
        if (em) return em[1].trim();
      }
    }
    const em = t.match(/입차\s*일시\s*[：:]*\s*([0-9]{4}\.[0-9]{2}\.[0-9]{2}\s*\([^)]+\)\s*\d{1,2}:\d{2})/);
    return em ? em[1].trim() : "";
  }

  function readMhpResultText() {
    const bodyText = (document.body?.innerText || "").replace(/\r/g, "");

    const emptyHint =
      bodyText.includes("4자리 차량 번호를 입력해주세요") || bodyText.includes("4자리 차량번호를 입력");
    const hasEntry = /입차\s*일시/.test(bodyText);
    if (emptyHint && !hasEntry) return "";

    const pill = extractMhpPillRowInfo();
    const durDom = extractParkingDurationFromDom();
    const entryDom = extractEntryFromDom();

    const scope = findVehicleInfoBlock();
    const scoped = scope?.innerText ? scope.innerText.replace(/\r/g, "") : "";

    const entry =
      pill.entry ||
      entryDom ||
      parseEntryFromRaw(scoped) ||
      parseEntryFromRaw(bodyText);
    let duration =
      pill.duration ||
      durDom ||
      parseDurationPreferHoursAfterLabel(scoped) ||
      parseDurationPreferHoursAfterLabel(bodyText) ||
      parseDurationFromRawStrict(scoped) ||
      parseDurationFromRawStrict(bodyText);

    const scopeForSanity = scoped || bodyText;
    if (
      duration &&
      /^\d{1,4}분$/.test(durationCompact(duration)) &&
      /\d+\s*시간\s*\d+\s*분/.test(scopeForSanity) &&
      !pill.duration
    ) {
      duration =
        parseDurationPreferHoursAfterLabel(scopeForSanity) ||
        parseDurationPreferHoursAfterLabel(bodyText) ||
        parseDurationFromRawStrict(scopeForSanity) ||
        parseDurationFromRawStrict(bodyText);
    }

    if (
      duration &&
      isTicketLikeMinutesOnlyDuration(duration) &&
      !pill.duration &&
      !durDom
    ) {
      duration =
        parseDurationPreferHoursAfterLabel(scopeForSanity) ||
        parseDurationPreferHoursAfterLabel(bodyText) ||
        "";
    }

    if (entry && duration && isValidDuration(durationCompact(duration))) {
      return "입차일시 " + entry + " · 주차시간 " + duration;
    }

    return "";
  }

  /** MHP 할인 적용 내역 카드 루트 (제공된 마크업 기준) */
  const MHP_DISCOUNT_CARD_SEL = "div.relative.flex.w-full.flex-col.gap-2";

  /**
   * 할인 적용 내역이 들어 있는 MHP DOM 구간(너무 크면 잘못된 상위 div).
   * 제목만 있는 작은 래퍼가 잡히면 카드가 빠지므로, h2 기준으로 카드가 있는 조상을 우선 사용.
   */
  function findMhpDiscountHistorySectionRoot() {
    let best = null;
    let bestLen = Infinity;
    for (const el of document.querySelectorAll("section, article, main, aside, div")) {
      if (!(el instanceof HTMLElement)) continue;
      const it = el.innerText || "";
      if (!/할인\s*적용\s*내역/.test(it.slice(0, 400))) continue;
      const len = it.length;
      if (len < 120 || len > 45000) continue;
      if (len < bestLen) {
        bestLen = len;
        best = el;
      }
    }
    return best;
  }

  function findMhpDiscountHistoryScope() {
    const h2s = document.querySelectorAll("h2");
    for (const h2 of h2s) {
      const ht = (h2.textContent || "").replace(/\s+/g, " ").trim();
      if (!/할인\s*적용\s*내역/.test(ht.slice(0, 100))) continue;
      let node = h2.parentElement;
      for (let i = 0; i < 18 && node; i++) {
        try {
          if (node.querySelectorAll(MHP_DISCOUNT_CARD_SEL).length >= 1) return node;
        } catch (_) {}
        node = node.parentElement;
      }
      return h2.parentElement || document.body;
    }
    return findMhpDiscountHistorySectionRoot();
  }

  function countsToSummaryParts(counts) {
    const parts = [];
    if (counts.day) parts.push(`종일 ${counts.day}매`);
    if (counts.h2) parts.push(`2시간 할인권 ${counts.h2}매`);
    if (counts.h1) parts.push(`1시간 할인권 ${counts.h1}매`);
    if (counts.m30) parts.push(`30분 할인권 ${counts.m30}매`);
    if (counts.other) parts.push(`기타 할인 ${counts.other}건`);
    return parts.join(", ");
  }

  function classifyTicketLineIntoCounts(counts, oneLineNorm) {
    let hit = false;
    if (/당일권/.test(oneLineNorm)) {
      counts.day += 1;
      hit = true;
    } else if (/2\s*시간.*할인|2시간할인/.test(oneLineNorm)) {
      counts.h2 += 1;
      hit = true;
    } else if (/1\s*시간.*할인|1시간할인/.test(oneLineNorm)) {
      counts.h1 += 1;
      hit = true;
    } else if (/30\s*분.*할인|30분.*할인/.test(oneLineNorm)) {
      counts.m30 += 1;
      hit = true;
    }
    if (!hit) counts.other += 1;
  }

  /**
   * DOM: MHP 마크업 기준
   * - 카드: div.relative.flex.w-full.flex-col.gap-2
   * - 활성: span.text-orange-600 직계 자식 span 텍스트가 「미사용」
   * - 취소: span.text-red-600 → 「적용 취소」(카드에 orange 미사용 없음)
   */
  function readMhpActiveDiscountSummaryFromDom() {
    const scope = findMhpDiscountHistoryScope();
    if (!scope) return "";

    const counts = { day: 0, h2: 0, h1: 0, m30: 0, other: 0 };

    function normTxt(s) {
      return String(s || "")
        .trim()
        .replace(/\u00a0/g, " ")
        .replace(/[\u200b-\u200d\ufeff]/g, "");
    }

    /** 활성(미사용) 카드만 true — orange 래퍼 안의 직접 자식 span이 정확히 미사용 */
    function isMhpActiveUnusedDiscountCard(card) {
      if (!(card instanceof HTMLElement)) return false;
      const oranges = card.querySelectorAll("span.text-orange-600, span[class*='text-orange-600']");
      for (let oi = 0; oi < oranges.length; oi++) {
        const o = oranges[oi];
        let raw = "";
        for (const ch of o.children) {
          if (ch.tagName === "SPAN") {
            raw = normTxt(ch.textContent);
            break;
          }
        }
        if (!raw) raw = normTxt(o.textContent);
        if (raw === "미사용") return true;
      }
      return false;
    }

    let cards;
    try {
      cards = scope.querySelectorAll(MHP_DISCOUNT_CARD_SEL);
    } catch (_) {
      return "";
    }
    if (!cards.length) {
      try {
        cards = scope.querySelectorAll("div.relative.flex[class*='flex-col'][class*='gap-2']");
      } catch (_) {
        return "";
      }
    }
    if (!cards.length) return "";

    for (let ci = 0; ci < cards.length; ci++) {
      const card = cards[ci];
      if (!isMhpActiveUnusedDiscountCard(card)) continue;
      const oneLine = (card.innerText || "").replace(/\r/g, "").replace(/\s+/g, " ").trim();
      classifyTicketLineIntoCounts(counts, oneLine);
    }

    return countsToSummaryParts(counts);
  }

  /** innerText 슬라이스 기반 (DOM 실패 시 보조) */
  function readMhpActiveDiscountSummaryFromText() {
    const raw = (document.body?.innerText || "").replace(/\r/g, "");
    const key = "할인 적용 내역";
    const i = raw.indexOf(key);
    if (i < 0) return "";

    let after = raw.slice(i + key.length);
    after = after.replace(/^\s*(\([\d\s]*건\))?\s*/, "");

    const stopRe =
      /\n(?:주차\s*할인|할인\s*선택|메모\s*입력|차량\s*정보|총\s*주차|결제|홈으로)/;
    const sm = after.match(stopRe);
    const chunk = sm && sm.index != null ? after.slice(0, sm.index) : after.slice(0, 10000);

    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    const timeRe = /\d{4}\.\d{2}\.\d{2}\s+\d{1,2}:\d{2}/;

    const counts = { day: 0, h2: 0, h1: 0, m30: 0, other: 0 };

    function cardBoundsForLine(li) {
      let bs = li;
      for (let k = li - 1; k >= 0 && k >= li - 24; k--) {
        if (timeRe.test(lines[k])) {
          bs = k + 1;
          break;
        }
        bs = k;
      }
      let be = li;
      for (let k = li + 1; k < lines.length && k <= li + 20; k++) {
        if (timeRe.test(lines[k])) {
          be = k;
          break;
        }
        be = k;
      }
      return { bs, be };
    }

    function classifySegment(segLines) {
      const t = segLines.join(" ").replace(/\s+/g, " ");
      if (!/미사용/.test(t) || /취소\s*내역\s*표시|할인\s*적용\s*내역/.test(t)) return;
      if (!/적용\s*취소/.test(t)) {
        const idxs = [];
        for (let i = 0; i < segLines.length; i++) {
          const L = segLines[i];
          if (/미사용/.test(L) && !/적용\s*취소/.test(L)) idxs.push(i);
        }
        for (const idx of idxs) {
          const sub = segLines.slice(Math.max(0, idx - 12), idx + 1).join(" ").replace(/\s+/g, " ");
          classifyTicketLineIntoCounts(counts, sub);
        }
        return;
      }
      let buf = [];
      for (const L of segLines) {
        if (/적용\s*취소/.test(L) && !/미사용/.test(L)) {
          if (buf.length) {
            const u = buf.join(" ").replace(/\s+/g, " ");
            if (/미사용/.test(u) && !/적용\s*취소/.test(u)) classifyTicketLineIntoCounts(counts, u);
          }
          buf = [];
        } else {
          buf.push(L);
        }
      }
      if (buf.length) {
        const u = buf.join(" ").replace(/\s+/g, " ");
        if (/미사용/.test(u) && !/적용\s*취소/.test(u)) classifyTicketLineIntoCounts(counts, u);
      }
    }

    const doneRanges = new Set();
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!/미사용/.test(line)) continue;
      if (/적용\s*취소/.test(line)) continue;
      if (/취소\s*내역\s*표시|할인\s*적용\s*내역/.test(line)) continue;

      const { bs, be } = cardBoundsForLine(li);
      const rangeKey = `${bs}-${be}`;
      if (doneRanges.has(rangeKey)) continue;
      doneRanges.add(rangeKey);

      classifySegment(lines.slice(bs, be + 1));
    }

    return countsToSummaryParts(counts);
  }

  function readMhpActiveDiscountSummary() {
    const dom = readMhpActiveDiscountSummaryFromDom().trim();
    if (dom) return dom;
    return readMhpActiveDiscountSummaryFromText().trim();
  }

  /** MHP가 차량 없음·미등록 등을 알릴 때 본문에 자주 쓰이는 문구 */
  function detectMhpLookupNoVehicle(bodyText) {
    const t = String(bodyText || "").replace(/\r/g, "");
    if (/찾을\s*수\s*없/.test(t)) return true;
    if (/등록되지\s*않은?\s*차량/.test(t)) return true;
    if (/조회된?\s*차량이\s*없/.test(t)) return true;
    if (/해당\s*차량[^\n]{0,20}없/.test(t)) return true;
    if (/차량[^\n]{0,12}존재하지\s*않/.test(t)) return true;
    if (/검색\s*결과가\s*없/.test(t)) return true;
    if (/조회\s*결과가\s*없/.test(t)) return true;
    if (/입차\s*정보가\s*없/.test(t)) return true;
    return false;
  }

  /** 조회 요청 직후 스피너만 도는 경우 4초 만에 끊지 않도록 */
  function detectMhpLookupBusy(bodyText) {
    const t = String(bodyText || "");
    return (
      /조회\s*중/.test(t) ||
      /검색\s*중/.test(t) ||
      /로딩\s*중/.test(t) ||
      /loading/i.test(t) ||
      /불러오는\s*중/.test(t)
    );
  }

  /**
   * 글자마다 이벤트는내되, 전부 동기 루프로 처리 → 백그라운드 탭에서도 rAF/다중 타이머에 안 막힘.
   * 마지막에 setTimeout(0) 한 번으로 MHP 쪽 반응·조회 요청이 스케줄되게 함.
   */
  function typeFourDigitsThen(input, digits, onDone) {
    input.focus();
    setInputValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    for (let idx = 0; idx < digits.length; idx++) {
      const ch = digits[idx];
      setInputValue(input, (input.value || "") + ch);
      try {
        input.dispatchEvent(
          new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: ch })
        );
      } catch (_) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    try {
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: digits.slice(-1),
        })
      );
    } catch (_) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setTimeout(onDone, 0);
  }

  function waitForResult(beforeText, requestId, appTabId, vehicleDigits) {
    const start = Date.now();
    /**
     * '미등록/없음' 문구는 첫 조회 직후 로딩·플레이스홀더에 잠깐 떴다 사라지는 경우가 있음.
     * 예전: initialNoVehicle===false 일 때 trustNoVehicleMsg가 항상 true라 첫 폴링(10ms)에서 바로 실패함.
     * → 최소 경과 후에만 미등록으로 끊고, 조회 중(busy)이면 끊지 않음.
     */
    /** busy 체크로 오인 완화 → 실패 판정만 너무 늦추지 않음 */
    const NO_VEHICLE_FAIL_MIN_MS = 2100;

    let done = false;
    let lastStable = null;
    let stableCount = 0;

    function complete(ok, text, err) {
      if (done) return;
      done = true;
      clearInterval(timer);
      try {
        obs.disconnect();
      } catch (_) {}

      if (!ok) {
        chrome.runtime.sendMessage({
          type: "MHP_LOOKUP_RESULT",
          appTabId,
          requestId,
          ok: false,
          parkingTimeText: text || "",
          error: err,
          appliedDiscountsSummary: "",
        });
        return;
      }

      /** 입차정보는 먼저 안정되는데 할인 내역 카드가 늦게 붙는 경우가 있어, 짧게 여러 번 읽어 가장 풍부한 요약을 택함 */
      function scoreSummary(s) {
        const t = String(s || "").trim();
        if (!t) return 0;
        const hits = (t.match(/매|건/g) || []).length;
        return hits * 20 + t.length;
      }
      function richer(a, b) {
        const sa = String(a || "").trim();
        const sb = String(b || "").trim();
        if (!sb) return sa;
        if (!sa) return sb;
        return scoreSummary(sb) > scoreSummary(sa) ? sb : sa;
      }
      let bestSummary = readMhpActiveDiscountSummary();
      const flush = () => {
        bestSummary = richer(bestSummary, readMhpActiveDiscountSummary());
      };
      const sendOk = () => {
        chrome.runtime.sendMessage({
          type: "MHP_LOOKUP_RESULT",
          appTabId,
          requestId,
          ok: true,
          parkingTimeText: text || "",
          error: err || "",
          appliedDiscountsSummary: bestSummary,
        });
      };
      flush();
      /** 할인 카드 DOM이 늦게 붙을 수 있어 짧게 재읽기(이전 0+140+280ms → 약 160ms로 단축, 기능 유지) */
      const SUMMARY_T1_MS = 45;
      const SUMMARY_T2_MS = 110;
      setTimeout(() => {
        flush();
        setTimeout(() => {
          flush();
          sendOk();
        }, SUMMARY_T2_MS);
      }, SUMMARY_T1_MS);
    }

    function tryOnce() {
      const bodyText = (document.body?.innerText || "").replace(/\r/g, "");
      const elapsed = Date.now() - start;
      const text = readMhpResultText();
      const plateOk = mhpUiShowsLookupVehicleDigits(vehicleDigits);

      if (
        detectMhpLookupNoVehicle(bodyText) &&
        !detectMhpLookupBusy(bodyText) &&
        !(text && plateOk) &&
        elapsed >= NO_VEHICLE_FAIL_MIN_MS
      ) {
        complete(
          false,
          "",
          "MHP에서 해당 차량을 찾지 못했습니다. 차량 번호 4자리를 확인한 뒤 다시 조회하세요."
        );
        return;
      }

      const changedOrWaited = text && (text !== beforeText || elapsed >= SAME_RESULT_MIN_MS);

      if (text && changedOrWaited) {
        if (!plateOk) {
          lastStable = null;
          stableCount = 0;
        } else if (text === lastStable) {
          stableCount += 1;
        } else {
          lastStable = text;
          stableCount = 1;
        }
        if (plateOk && stableCount >= STABLE_NEED && elapsed >= STABLE_MIN_ELAPSED_MS) {
          complete(true, text);
          return;
        }
      } else {
        lastStable = null;
        stableCount = 0;
      }

      if (
        elapsed >= LOOKUP_NO_RESULT_MS &&
        text &&
        !plateOk &&
        !detectMhpLookupBusy(bodyText)
      ) {
        complete(
          false,
          "",
          "MHP 화면이 입력한 차량 번호로 아직 바뀌지 않았습니다. 잠시 후 다시 조회해 주세요."
        );
        return;
      }

      if (elapsed >= LOOKUP_NO_RESULT_MS && !text && !detectMhpLookupBusy(bodyText)) {
        complete(
          false,
          "",
          "MHP에서 해당 차량 정보를 찾지 못했습니다. 차량 번호를 확인한 뒤 다시 조회하세요."
        );
        return;
      }

      if (elapsed >= MAX_WAIT_MS) {
        complete(
          false,
          text || "",
          "MHP에서 입차일시·주차시간을 읽지 못했습니다. 주차 할인 화면에서 결과가 보이는지 확인한 뒤 다시 조회하세요."
        );
      }
    }

    const obs = new MutationObserver(() => tryOnce());
    try {
      obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    } catch (_) {}

    const timer = setInterval(tryOnce, POLL_MS);
    tryOnce();
  }

  function runLookup(msg) {
    const { vehicleNum, requestId, appTabId } = msg;
    const v = String(vehicleNum || "").replace(/\D/g, "").slice(0, 4);

    const input = findCarInput();
    if (!input) {
      chrome.runtime.sendMessage({
        type: "MHP_LOOKUP_RESULT",
        appTabId,
        requestId,
        ok: false,
        parkingTimeText: "",
        error:
          "차량 번호 입력칸을 찾지 못했습니다. MHP에서 「주차 할인」화면·4자리 입력 칸이 보이는지 확인하세요.",
      });
      return;
    }

    if (v.length !== 4) {
      chrome.runtime.sendMessage({
        type: "MHP_LOOKUP_RESULT",
        appTabId,
        requestId,
        ok: false,
        parkingTimeText: "",
        error: "차량 번호는 4자리여야 합니다.",
      });
      return;
    }

    const beforeText = readMhpResultText();

    typeFourDigitsThen(input, v, () => {
      waitForResult(beforeText, requestId, appTabId, v);
    });
  }

  function sendApplyResult(appTabId, requestId, ok, error, detail) {
    chrome.runtime.sendMessage({
      type: "MHP_APPLY_RESULT",
      appTabId,
      requestId,
      ok: !!ok,
      error: error || "",
      detail: detail || "",
    });
  }

  /** MHP 라디오: 당일권(앱 종일) / 2시간 / 1시간 / 30분 할인권 */
  function rowMatchesDiscount(t, fragment) {
    if (fragment === "당일권") return t.includes("당일권");
    if (fragment === "2시간") return t.includes("2시간");
    if (fragment === "1시간") return t.includes("1시간");
    if (fragment === "30분") return t.includes("30분") && (t.includes("할인") || t.includes("권"));
    return t.includes(fragment);
  }

  function selectDiscountRadio(fragment) {
    const radios = document.querySelectorAll('input[type="radio"]');
    for (const r of radios) {
      const box = r.closest("label, li, tr, div");
      const t = (box?.innerText || "").replace(/\s+/g, " ");
      if (rowMatchesDiscount(t, fragment)) {
        r.click();
        return true;
      }
    }
    return false;
  }

  function setDiscountQuantity(n) {
    const target = Math.min(99, Math.max(1, parseInt(String(n), 10) || 1));
    const inputs = document.querySelectorAll('input[type="number"]');
    for (const inp of inputs) {
      if (!inp.offsetParent) continue;
      const wrap = inp.closest("div, section, form");
      if (!wrap) continue;
      const ctx = wrap.innerText || "";
      if (!/할인|수량|적용|당일|메모/.test(ctx)) continue;
      inp.focus();
      inp.value = String(target);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      try {
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        desc?.set?.call(inp, String(target));
        inp.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" }));
      } catch (_) {}
      return true;
    }
    return true;
  }

  function clickDiscountApplyButton() {
    const nodes = document.querySelectorAll("button, [role='button']");
    for (const b of nodes) {
      const tx = (b.textContent || "").replace(/\s+/g, " ").trim();
      if (tx.includes("할인") && tx.includes("적용")) {
        b.click();
        return true;
      }
    }
    return false;
  }

  function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function applyOneDiscount(frag, qty) {
    if (!selectDiscountRadio(frag)) {
      throw new Error(
        `「${frag}」할인을 찾지 못했습니다. 주차 할인·조회된 차량 화면인지 확인하세요.`
      );
    }
    setDiscountQuantity(qty);
    if (!clickDiscountApplyButton()) {
      throw new Error("「할인 적용」버튼을 찾지 못했습니다.");
    }
    /** 백그라운드 탭에서는 짧은 delay를 여러 번 두면 각각 쓰로틀될 수 있어 한 번만 대기(가능한 짧게) */
    await delay(240);
  }

  function formatWonDisplay(numStr) {
    const n = parseInt(String(numStr).replace(/,/g, "").replace(/\s/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) return "";
    return `${n.toLocaleString("ko-KR")}원`;
  }

  /** MHP 우측 「스토어 크레딧」 영역의 잔액 (예: 197,500원) */
  function readMhpStoreCredit() {
    const nodes = document.querySelectorAll("aside, div, section, header, main, article");
    for (const el of nodes) {
      const t = normSpaces((el.innerText || "").replace(/\r/g, ""));
      if (!t.includes("스토어") || !t.includes("크레딧")) continue;
      if (t.length > 2000) continue;
      const m = t.match(/스토어\s*크레딧[^0-9]{0,160}?([\d,]+)\s*원/);
      if (m) {
        const disp = formatWonDisplay(m[1]);
        if (disp) return disp;
      }
    }
    const body = normSpaces((document.body?.innerText || "").replace(/\r/g, ""));
    const m = body.match(/스토어\s*크레딧[\s\S]{0,220}?([\d,]+)\s*원/);
    if (m) return formatWonDisplay(m[1]) || "";
    return "";
  }

  function sendCreditResult(appTabId, requestId, ok, creditText, error) {
    chrome.runtime.sendMessage({
      type: "MHP_CREDIT_RESULT",
      appTabId,
      requestId,
      ok: !!ok,
      creditText: creditText || "",
      error: error || "",
    });
  }

  function runCreditRead(msg) {
    const { requestId, appTabId } = msg;
    const text = readMhpStoreCredit();
    if (text) {
      sendCreditResult(appTabId, requestId, true, text, "");
    } else {
      sendCreditResult(
        appTabId,
        requestId,
        false,
        "",
        "MHP 우측 사이드바에서 스토어 크레딧(원)을 찾지 못했습니다. 주차 할인 탭이 열린 상태인지 확인하세요."
      );
    }
  }

  function runApply(msg) {
    const { requestId, appTabId, all_day_cnt, cnt_2h, cnt_1h, cnt_30m } = msg;
    const ad = Number(all_day_cnt) || 0;
    const h2 = Number(cnt_2h) || 0;
    const h1 = Number(cnt_1h) || 0;
    const m30 = Number(cnt_30m) || 0;
    /** 종일 → 당일권, 나머지는 MHP 라벨 순서대로 연속 적용 */
    const active = [];
    if (ad > 0) active.push({ frag: "당일권", label: "종일", qty: ad });
    if (h2 > 0) active.push({ frag: "2시간", label: "2h", qty: h2 });
    if (h1 > 0) active.push({ frag: "1시간", label: "1h", qty: h1 });
    if (m30 > 0) active.push({ frag: "30분", label: "30m", qty: m30 });

    if (active.length === 0) {
      sendApplyResult(
        appTabId,
        requestId,
        false,
        "종일·2h·1h·30m 중 최소 하나에 수량을 입력한 뒤 등록하세요.",
        ""
      );
      return;
    }

    void (async () => {
      try {
        const summaryBits = [];
        for (const step of active) {
          await applyOneDiscount(step.frag, step.qty);
          summaryBits.push(`${step.label} ${step.qty}매`);
        }
        sendApplyResult(
          appTabId,
          requestId,
          true,
          "",
          `${summaryBits.join(", ")} 순으로 MHP에 할인 적용을 요청했습니다. 콘솔에서 결과를 확인하세요.`
        );
      } catch (e) {
        sendApplyResult(appTabId, requestId, false, e?.message || String(e), "");
      }
    })();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "EXECUTE_MHP_LOOKUP") {
      sendResponse({ received: true });
      runLookup(msg);
      return false;
    }
    if (msg.type === "EXECUTE_MHP_APPLY") {
      sendResponse({ received: true });
      runApply(msg);
      return false;
    }
    if (msg.type === "EXECUTE_MHP_CREDIT") {
      sendResponse({ received: true });
      runCreditRead(msg);
      return false;
    }
    return false;
  });
})();
