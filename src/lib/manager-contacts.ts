// 담당자 연락처 마스터 조회·저장 (기관 등록 시 자동완성)
import type { SupabaseClient } from "@supabase/supabase-js";
import { managerPhoneText, sanitizeManagerPhoneDigits } from "@/lib/manager-display";
import { contactMatchKey, type OrgAliases } from "@/lib/contact-import/org-name-rules";
import orgAliases from "../../data/org-aliases.json";
import type { Project } from "@/lib/supabase";

export type ManagerContact = {
  id?: string;
  name: string;
  org_name: string;
  phone: string;
  updated_at?: string;
};

export function managerContactKey(name: string, orgName: string): string {
  return `${String(orgName ?? "").trim()}::${String(name ?? "").trim()}`;
}

function normalizeContact(input: {
  name: string;
  org_name?: string | null;
  phone: string;
  id?: string;
  updated_at?: string;
}): ManagerContact | null {
  const name = String(input.name ?? "").trim();
  const phone = managerPhoneText(input.phone);
  if (!name || !phone) return null;
  return {
    id: input.id,
    name,
    org_name: String(input.org_name ?? "").trim(),
    phone,
    updated_at: input.updated_at,
  };
}

/** 여러 출처 목록 병합 — 동일 키면 updated_at 최신 우선 */
export function mergeManagerContacts(...lists: ManagerContact[][]): ManagerContact[] {
  const map = new Map<string, ManagerContact>();
  for (const list of lists) {
    for (const item of list) {
      const key = managerContactKey(item.name, item.org_name);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, item);
        continue;
      }
      const prevTs = prev.updated_at ? Date.parse(prev.updated_at) : 0;
      const nextTs = item.updated_at ? Date.parse(item.updated_at) : 0;
      if (nextTs >= prevTs) map.set(key, item);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const org = a.org_name.localeCompare(b.org_name, "ko");
    if (org !== 0) return org;
    return a.name.localeCompare(b.name, "ko");
  });
}

/** 기존 행사 데이터에서 연락처 후보 추출 */
export function buildManagerContactsFromProjects(projects: Project[]): ManagerContact[] {
  const items: ManagerContact[] = [];
  for (const p of projects) {
    const c = normalizeContact({
      name: p.manager,
      org_name: p.org_name,
      phone: p.manager_phone ?? "",
      updated_at: p.updated_at,
    });
    if (c) items.push(c);
  }
  return mergeManagerContacts(items);
}

export async function fetchManagerContacts(
  supabase: SupabaseClient
): Promise<ManagerContact[]> {
  const { data, error } = await supabase
    .from("manager_contacts")
    .select("id, name, org_name, phone, updated_at")
    .order("name");
  if (error) {
    console.warn("[manager_contacts]", error.message);
    return [];
  }
  return mergeManagerContacts(
    (data ?? [])
      .map((row) =>
        normalizeContact({
          id: row.id,
          name: row.name,
          org_name: row.org_name,
          phone: row.phone,
          updated_at: row.updated_at,
        })
      )
      .filter((c): c is ManagerContact => Boolean(c))
  );
}

export async function upsertManagerContactRemote(
  supabase: SupabaseClient,
  name: string,
  orgName: string,
  phone: string
): Promise<void> {
  const normalized = normalizeContact({
    name,
    org_name: orgName,
    phone,
    updated_at: new Date().toISOString(),
  });
  if (!normalized) return;
  const { error } = await supabase.from("manager_contacts").upsert(
    {
      name: normalized.name,
      org_name: normalized.org_name,
      phone: normalized.phone,
      updated_at: normalized.updated_at,
    },
    { onConflict: "name,org_name" }
  );
  if (error) console.warn("[manager_contacts upsert]", error.message);
}

/** 등록 폼 자동완성·자동 입력용 연락처 검색 */
export function buildManagerContactPhoneIndex(
  contacts: ManagerContact[],
  aliases: OrgAliases = orgAliases as OrgAliases
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of contacts) {
    const phone = managerPhoneText(c.phone);
    if (!phone) continue;
    const key = contactMatchKey(c.name, c.org_name, aliases);
    map.set(key, phone);
  }
  return map;
}

/** 행사에 번호가 없을 때 manager_contacts 마스터에서 조회 (기관명 별칭 매칭) */
export function lookupPhoneForManagerOrg(
  manager: string,
  orgName: string,
  contacts: ManagerContact[],
  phoneIndex?: Map<string, string>
): string | null {
  const name = manager.trim();
  const org = orgName.trim();
  if (!name) return null;

  const index = phoneIndex ?? buildManagerContactPhoneIndex(contacts);
  if (org) {
    const key = contactMatchKey(name, org, orgAliases as OrgAliases);
    const fromKey = index.get(key);
    if (fromKey) return fromKey;
  }

  return lookupManagerPhone(contacts, name, org);
}

/** 행사 레코드 — projects.manager_phone 우선, 없으면 마스터 연락처 */
export function resolveProjectManagerPhone(
  project: Pick<Project, "manager" | "org_name" | "manager_phone">,
  contacts: ManagerContact[],
  phoneIndex?: Map<string, string>
): string | null {
  const fromProject = managerPhoneText(project.manager_phone);
  if (fromProject) return fromProject;
  return lookupPhoneForManagerOrg(
    String(project.manager ?? ""),
    String(project.org_name ?? ""),
    contacts,
    phoneIndex
  );
}

export function lookupManagerPhone(
  contacts: ManagerContact[],
  managerName: string,
  orgName?: string
): string | null {
  const name = managerName.trim();
  const org = (orgName ?? "").trim();
  if (!name) return null;

  const exact = contacts.find((c) => c.name === name && c.org_name === org);
  if (exact) return exact.phone;

  const byName = contacts.filter((c) => c.name === name);
  if (byName.length === 1) return byName[0]!.phone;

  if (org) {
    const orgMatch = byName.find((c) => c.org_name === org);
    if (orgMatch) return orgMatch.phone;
  }

  return null;
}

export function filterManagerContactSuggestions(
  contacts: ManagerContact[],
  managerQuery: string,
  orgName?: string
): ManagerContact[] {
  const q = managerQuery.trim().toLowerCase();
  const org = (orgName ?? "").trim();

  let list = contacts;
  if (org) {
    const sameOrg = contacts.filter((c) => c.org_name === org);
    if (sameOrg.length > 0) list = [...sameOrg, ...contacts.filter((c) => c.org_name !== org)];
  }

  if (!q) return list.slice(0, 50);

  return list
    .filter((c) => c.name.toLowerCase().includes(q) || c.org_name.toLowerCase().includes(q))
    .slice(0, 50);
}

export function persistManagerContact(input: {
  isDev: boolean;
  supabase: SupabaseClient;
  contacts: ManagerContact[];
  name: string;
  orgName: string;
  phone: string;
}): ManagerContact[] {
  const digits = sanitizeManagerPhoneDigits(input.phone);
  if (!input.name.trim() || !digits) return input.contacts;
  if (!input.isDev) {
    void upsertManagerContactRemote(input.supabase, input.name, input.orgName, digits);
  }
  const normalized = normalizeContact({
    name: input.name,
    org_name: input.orgName,
    phone: digits,
    updated_at: new Date().toISOString(),
  });
  if (!normalized) return input.contacts;
  return mergeManagerContacts(input.contacts, [normalized]);
}
