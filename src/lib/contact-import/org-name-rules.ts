// 고객 DM CSV import 시 기관명 매칭·저장 규칙

export type OrgAliases = {
  compact: Record<string, string>;
  expand: Record<string, string>;
};

function sortedAliasEntries(map: Record<string, string>): Array<[string, string]> {
  return Object.entries(map).sort((a, b) => b[0].length - a[0].length);
}

/** 문자열 안 별칭 치환 (긴 키 우선) */
export function applyOrgAliases(text: string, map: Record<string, string>): string {
  let s = String(text ?? "").trim();
  if (!s) return "";
  for (const [from, to] of sortedAliasEntries(map)) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  return s.replace(/\s+/g, " ").trim();
}

/** 매칭용: expand 후 compact 로 정규화 */
export function normalizeOrgForMatch(orgName: string, aliases: OrgAliases): string {
  const expanded = applyOrgAliases(orgName, aliases.expand);
  return applyOrgAliases(expanded, aliases.compact);
}

function isAliasInstitution(sheetOrg: string, aliases: OrgAliases): boolean {
  const org = sheetOrg.trim();
  if (!org) return false;
  if (org.includes("산인공") || org.includes("한국산업인력공단")) return true;
  if (org.includes("한기대") || org.includes("한국기술교육대학교")) return true;
  const expanded = applyOrgAliases(org, aliases.expand);
  const compacted = applyOrgAliases(org, aliases.compact);
  return expanded !== org || compacted !== org;
}

/**
 * 앱 manager_contacts.org_name 으로 저장할 값
 * - 산인공/한기대: compact(기관명) + 부서명
 * - 그 외(서울시교육청 등): 시트 기관명만 (부서는 org_name에 안 붙임)
 */
export function resolveStorageOrgName(
  sheetOrg: string,
  sheetDept: string,
  aliases: OrgAliases
): string {
  const org = sheetOrg.trim();
  const dept = sheetDept.trim();
  if (!org) return "";

  if (isAliasInstitution(org, aliases)) {
    const base = applyOrgAliases(org, aliases.compact);
    return dept ? `${base} ${dept}` : base;
  }

  return org;
}

export function contactMatchKey(name: string, orgName: string, aliases: OrgAliases): string {
  const n = String(name ?? "").trim();
  const o = normalizeOrgForMatch(orgName, aliases);
  return `${n}::${o}`;
}
