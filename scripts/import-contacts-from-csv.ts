/**
 * 고객 DM CSV → Supabase manager_contacts 1회 import
 *
 * 사용:
 *   npm run import:contacts -- --dry-run ./data/고객DM.csv
 *   npm run import:contacts -- ./data/고객DM.csv
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sanitizeManagerPhoneDigits } from "../src/lib/manager-display";
import {
  contactMatchKey,
  normalizeOrgForMatch,
  resolveStorageOrgName,
  type OrgAliases,
} from "../src/lib/contact-import/org-name-rules";
import { findCsvColumnIndex, parseCsvText } from "../src/lib/contact-import/parse-csv";

type CsvContactRow = {
  line: number;
  sheetOrg: string;
  sheetDept: string;
  name: string;
  phone: string;
  storageOrg: string;
  matchKey: string;
};

type AppOrgHint = {
  org_name: string;
  matchKey: string;
};

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function loadAliases(): OrgAliases {
  const path = resolve(process.cwd(), "data/org-aliases.json");
  return JSON.parse(readFileSync(path, "utf8")) as OrgAliases;
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const file = argv.find((a) => !a.startsWith("--") && a.endsWith(".csv"));
  if (!file) {
    console.error("사용법: npm run import:contacts -- [--dry-run] <csv파일경로>");
    process.exit(1);
  }
  return { dryRun, file: resolve(process.cwd(), file) };
}

function parseCsvContacts(csvPath: string, aliases: OrgAliases): CsvContactRow[] {
  const text = readFileSync(csvPath, "utf8");
  const table = parseCsvText(text);
  if (table.length < 2) {
    throw new Error("CSV에 헤더와 데이터 행이 필요합니다.");
  }

  const headers = table[0]!;
  const colOrg = findCsvColumnIndex(headers, ["기관명", "기관"]);
  const colDept = findCsvColumnIndex(headers, ["부서명", "부서"]);
  const colName = findCsvColumnIndex(headers, ["이름", "담당자명", "담당자"]);
  const colPhone = findCsvColumnIndex(headers, ["휴대폰번호", "휴대폰", "전화번호", "연락처"]);

  if (colOrg < 0 || colName < 0 || colPhone < 0) {
    throw new Error(
      `필수 열을 찾지 못했습니다. (기관명, 이름, 휴대폰번호)\n헤더: ${headers.join(" | ")}`
    );
  }

  const out: CsvContactRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const cells = table[i]!;
    const sheetOrg = (cells[colOrg] ?? "").trim();
    const sheetDept = colDept >= 0 ? (cells[colDept] ?? "").trim() : "";
    const name = (cells[colName] ?? "").trim();
    const phone = sanitizeManagerPhoneDigits(cells[colPhone] ?? "");

    if (!name && !sheetOrg && !phone) continue;

    const storageOrg = resolveStorageOrgName(sheetOrg, sheetDept, aliases);
    out.push({
      line: i + 1,
      sheetOrg,
      sheetDept,
      name,
      phone,
      storageOrg,
      matchKey: contactMatchKey(name, storageOrg, aliases),
    });
  }

  return out;
}

async function main() {
  loadEnvLocal();
  const { dryRun, file } = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    console.error(".env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY가 필요합니다.");
    process.exit(1);
  }

  const aliases = loadAliases();
  const rows = parseCsvContacts(file, aliases);

  const supabase = createClient(url, key);
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("manager, org_name");
  if (projErr) throw new Error(projErr.message);

  const appOrgByKey = new Map<string, AppOrgHint>();
  for (const p of projects ?? []) {
    const manager = String(p.manager ?? "").trim();
    const org = String(p.org_name ?? "").trim();
    if (!manager || !org) continue;
    const key = contactMatchKey(manager, org, aliases);
    if (!appOrgByKey.has(key)) {
      appOrgByKey.set(key, { org_name: org, matchKey: key });
    }
  }

  const deduped = new Map<string, CsvContactRow & { finalOrg: string; matchedApp: boolean }>();

  let skippedNoName = 0;
  let skippedNoOrg = 0;
  let skippedNoPhone = 0;

  for (const row of rows) {
    if (!row.name) {
      skippedNoName++;
      continue;
    }
    if (!row.storageOrg) {
      skippedNoOrg++;
      continue;
    }
    if (!row.phone) {
      skippedNoPhone++;
      continue;
    }

    const appHint = appOrgByKey.get(row.matchKey);
    const finalOrg = appHint?.org_name ?? row.storageOrg;
    deduped.set(row.matchKey, {
      ...row,
      finalOrg,
      matchedApp: Boolean(appHint),
    });
  }

  const toUpsert = Array.from(deduped.values());
  const matchedApp = toUpsert.filter((r) => r.matchedApp).length;
  const sheetOnly = toUpsert.length - matchedApp;

  console.log(`\n파일: ${file}`);
  console.log(`모드: ${dryRun ? "dry-run (DB 반영 안 함)" : "import"}`);
  console.log(`CSV 데이터 행: ${rows.length}`);
  console.log(`upsert 대상: ${toUpsert.length} (앱 매칭 ${matchedApp}, 시트 전용 ${sheetOnly})`);
  console.log(`건너뜀 — 이름 없음: ${skippedNoName}, 기관 없음: ${skippedNoOrg}, 번호 없음: ${skippedNoPhone}`);

  console.log("\n샘플 (최대 10건):");
  for (const r of toUpsert.slice(0, 10)) {
    console.log(
      `  L${r.line} ${r.name} | 시트:${r.sheetOrg}${r.sheetDept ? `/${r.sheetDept}` : ""} → 앱 org:"${r.finalOrg}" | ${r.phone}${r.matchedApp ? " [앱매칭]" : ""}`
    );
  }

  if (dryRun) {
    console.log("\n--dry-run 이므로 DB에는 쓰지 않았습니다. 문제 없으면 --dry-run 없이 다시 실행하세요.");
    return;
  }

  let ok = 0;
  let fail = 0;
  const now = new Date().toISOString();

  for (const r of toUpsert) {
    const { error } = await supabase.from("manager_contacts").upsert(
      {
        name: r.name,
        org_name: r.finalOrg,
        phone: r.phone,
        updated_at: now,
      },
      { onConflict: "name,org_name" }
    );
    if (error) {
      fail++;
      console.warn(`  실패 L${r.line} ${r.name} / ${r.finalOrg}: ${error.message}`);
    } else {
      ok++;
    }
  }

  console.log(`\n완료: 성공 ${ok}, 실패 ${fail}`);
  console.log("앱 기관 등록 화면에서 담당자 자동완성을 확인해 주세요.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
