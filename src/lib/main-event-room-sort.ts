/** 메인 화면 행사 목록: 공간(층·룸) 표시 문자열 기준 정렬 */

const FLOOR_ROOM_ORDER: Record<3 | 4 | 9, readonly string[]> = {
  3: ["A", "B", "C", "E", "F", "J"],
  4: [
    "D",
    "M",
    "N",
    "O",
    "K",
    "L",
    "KL",
    "R-1",
    "R-2",
    "S-1",
    "S-2",
    "T",
    "R통합",
    "S통합",
    "P-1",
    "P-2",
    "P통합",
  ],
  9: ["V-1", "V-2", "V-3", "W-1", "W-2", "W-3", "U-1", "U-2", "U통합"],
};

function stripTrailingRoomWord(s: string): string {
  return s.replace(/룸$/, "").trim();
}

/** 콤마·+ 등으로 나눈 뒤 `N층` 접두 제거·`룸` 접미 제거 */
function tokenizeRoomParts(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,，、]/)) {
    for (const sub of part.split(/[+＋／/]/)) {
      let t = sub.replace(/\d+\s*층/g, "").trim();
      t = stripTrailingRoomWord(t);
      if (t) out.push(t);
    }
  }
  return out;
}

function inferFloorFromRoomTokens(tokens: string[]): 3 | 4 | 9 | null {
  for (const t of tokens) {
    if (FLOOR_ROOM_ORDER[3].includes(t)) return 3;
    if (FLOOR_ROOM_ORDER[4].includes(t)) return 4;
    if (FLOOR_ROOM_ORDER[9].includes(t)) return 9;
  }
  return null;
}

function minRoomIndexOnFloor(floor: 3 | 4 | 9, tokens: string[]): number {
  const order = FLOOR_ROOM_ORDER[floor];
  let best = 10_000;
  for (const t of tokens) {
    const i = order.indexOf(t);
    if (i >= 0 && i < best) best = i;
  }
  return best === 10_000 ? 10_000 : best;
}

export type MainEventRoomSortFields = {
  roomName: string;
  org_name: string;
  manager: string;
};

/**
 * `roomName`: 해당 일자 공간 문자열(예: `4층 + V-1룸, W-1룸`, `3층`, `A` 등)
 */
export function compareMainEventListByRoom(a: MainEventRoomSortFields, b: MainEventRoomSortFields): number {
  const ka = sortKey(a.roomName);
  const kb = sortKey(b.roomName);
  if (ka.floorRank !== kb.floorRank) return ka.floorRank - kb.floorRank;
  if (ka.roomRank !== kb.roomRank) return ka.roomRank - kb.roomRank;
  const roomStr = a.roomName.localeCompare(b.roomName, "ko");
  if (roomStr !== 0) return roomStr;
  const o = a.org_name.localeCompare(b.org_name, "ko");
  if (o !== 0) return o;
  return a.manager.localeCompare(b.manager, "ko");
}

function firstFloorNumberInString(roomName: string): number | null {
  const re = /(\d+)\s*층/g;
  const m = re.exec(roomName);
  return m ? parseInt(m[1], 10) : null;
}

function sortKey(roomName: string): { floorRank: number; roomRank: number } {
  const trimmed = (roomName ?? "").trim();
  if (!trimmed || trimmed === "미지정") {
    return { floorRank: 99_000, roomRank: 0 };
  }

  const tokens = tokenizeRoomParts(trimmed);
  const firstN = firstFloorNumberInString(trimmed);

  if (firstN === 3 || firstN === 4 || firstN === 9) {
    const stdFloor = firstN as 3 | 4 | 9;
    const hasFloorOnly = tokens.length === 0 && /\d+\s*층/.test(trimmed);
    const roomIdx = hasFloorOnly ? -1 : minRoomIndexOnFloor(stdFloor, tokens);
    const roomRank = roomIdx === 10_000 ? 50_000 : roomIdx;
    return { floorRank: firstN === 3 ? 0 : firstN === 4 ? 1 : 2, roomRank };
  }

  if (firstN !== null) {
    return { floorRank: 100 + firstN, roomRank: 0 };
  }

  const inferred = inferFloorFromRoomTokens(tokens);
  if (inferred) {
    const roomIdx = minRoomIndexOnFloor(inferred, tokens);
    const roomRank = roomIdx === 10_000 ? 50_000 : roomIdx;
    return { floorRank: inferred === 3 ? 0 : inferred === 4 ? 1 : 2, roomRank };
  }

  return { floorRank: 1000, roomRank: 0 };
}
