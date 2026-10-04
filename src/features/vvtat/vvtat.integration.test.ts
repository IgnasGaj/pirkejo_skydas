import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { Preparation } from "./domain";
import { todayInVilnius } from "@/lib/date";
vi.mock("server-only", () => ({}));
import { packageZip, verifyPackageEvidenceMetadata } from "./export";

type User = { id: string; email: string; password: string };
type Credentials = { url: string; key: string; a: User; b: User };
const file = process.env.E2E_AUTH_CREDENTIALS_FILE;
const credentials = file ? JSON.parse(readFileSync(file, "utf8")) as Credentials : null;
const local = credentials && /^http:\/\/127\.0\.0\.1:\d+$/.test(credentials.url) ? it : it.skip;

local("pins the complete case snapshot, checks owner and evidence, and replays exact versions", async () => {
  const c = credentials!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const a = createClient<Database>(c.url, c.key, options);
  const b = createClient<Database>(c.url, c.key, options);
  const anonymous = createClient<Database>(c.url, c.key, options);
  expect((await a.auth.signInWithPassword(c.a)).error).toBeNull();
  expect((await b.auth.signInWithPassword(c.b)).error).toBeNull();
  const purchaseId = randomUUID(), complaintId = randomUUID(), versionId = randomUUID(), evidenceId = randomUUID();
  const foreignPurchaseId = randomUUID(), foreignEvidenceId = randomUUID(), pendingEvidenceId = randomUUID();
  const path = `${c.a.id}/${purchaseId}/${evidenceId}.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4\nVVTAT fixture\n");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const purchase = await a.from("purchases").insert({ id: purchaseId, user_id: c.a.id, product_name: "Bandymo prekė",
    seller_name: "Bandymo pardavėjas", purchase_date: "2026-10-01", purchase_channel: "PHYSICAL_STORE" }).select("*").single();
  expect(purchase.error).toBeNull();
  try {
    expect((await a.from("complaints").insert({ id: complaintId, user_id: c.a.id, purchase_id: purchaseId,
      family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers: {}, facts: {}, remedy: "REPAIR",
      purchase_updated_at: purchase.data!.updated_at, template_version: "test", source_version: "test" })).error).toBeNull();
    const sql = `insert into public.complaint_versions(id,user_id,purchase_id,complaint_id,version_no,request_id,document_date,snapshot,sections,plain_text,template_version,source_version) values ('${versionId}','${c.a.id}','${purchaseId}','${complaintId}',1,'${randomUUID()}','2026-10-01','{}','["Prašau pataisyti prekę."]','Prašau pataisyti prekę.','test','test')`;
    execFileSync("docker", ["exec", "supabase_db_pirkejo-skydas", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "ignore" });
    const created = await a.rpc("create_tracked_case", { p_version_id: versionId, p_request_id: randomUUID() });
    expect(created.error).toBeNull();
    const caseId = created.data!.id;
    const today = todayInVilnius();
    const event = await a.rpc("record_case_event", { p_case_id: caseId, p_request_id: randomUUID(), p_expected_revision: 0,
      p_kind: "SUBMITTED", p_occurred_on: today, p_payload: { method: "EMAIL", note: "" } });
    expect(event.error).toBeNull();
    expect((await a.storage.from("purchase-evidence").upload(path, bytes, { contentType: "application/pdf", upsert: false })).error).toBeNull();
    expect((await a.from("purchase_documents").insert({ id: evidenceId, user_id: c.a.id, purchase_id: purchaseId,
      document_type: "OTHER", original_filename: "bandymas.pdf", storage_path: path, mime_type: "application/pdf",
      size_bytes: bytes.length, content_sha256: hash, upload_state: "READY" })).error).toBeNull();
    expect((await b.from("purchases").insert({ id: foreignPurchaseId, user_id: c.b.id, product_name: "Kita prekė",
      seller_name: "Kitas pardavėjas", purchase_date: "2026-10-01", purchase_channel: "PHYSICAL_STORE" })).error).toBeNull();
    expect((await b.from("purchase_documents").insert({ id: foreignEvidenceId, user_id: c.b.id, purchase_id: foreignPurchaseId,
      document_type: "OTHER", original_filename: "svetimas.pdf", storage_path: `${c.b.id}/${foreignPurchaseId}/${foreignEvidenceId}.pdf`,
      mime_type: "application/pdf", size_bytes: bytes.length, content_sha256: hash, upload_state: "READY" })).error).toBeNull();
    expect((await a.from("purchase_documents").insert({ id: pendingEvidenceId, user_id: c.a.id, purchase_id: purchaseId,
      document_type: "OTHER", original_filename: "nebaigtas.pdf", storage_path: `${c.a.id}/${purchaseId}/${pendingEvidenceId}.pdf`,
      mime_type: "application/pdf", size_bytes: bytes.length, content_sha256: hash, upload_state: "PENDING" })).error).toBeNull();
    const payload: Preparation = { applicantName: "Vardas Pavardė", applicantEmail: "vartotojas@example.test",
      sellerName: "Bandymo pardavėjas", sellerContact: "", disputeSummary: "Prekė neveikia.",
      escalationReason: "Pardavėjas atsisakė.", requestedOutcome: "Prašau pataisyti prekę.", outcomeChangedExplanation: "",
      routing: { ownGoodsDispute: "YES", professionalSeller: "YES", inLithuania: "YES", anotherBody: "NO", specialJurisdiction: "NO" },
      selected: [{ id: evidenceId, purpose: "TRANSACTION" }], reviewed: true };
    const args = { p_case_id: caseId, p_expected_revision: 1, p_request_id: randomUUID(), p_payload: payload };
    expect((await b.rpc("create_vvtat_package", args)).error).not.toBeNull();
    expect((await anonymous.rpc("create_vvtat_package", args)).error).not.toBeNull();
    expect((await a.rpc("create_vvtat_package", { ...args, p_expected_revision: null as unknown as number })).error).not.toBeNull();
    expect((await a.rpc("create_vvtat_package", { ...args, p_request_id: randomUUID(), p_payload: { ...payload, reviewed: false } })).error).not.toBeNull();
    expect((await a.rpc("create_vvtat_package", { ...args, p_request_id: randomUUID(), p_payload: { ...payload, requestedOutcome: "Prašau pakeisti prekę." } })).error).not.toBeNull();
    for (const id of [foreignEvidenceId, pendingEvidenceId])
      expect((await a.rpc("create_vvtat_package", { ...args, p_request_id: randomUUID(), p_payload: { ...payload, selected: [{ id, purpose: "OTHER" }] } })).error).not.toBeNull();
    const first = await a.rpc("create_vvtat_package", args);
    expect(first.error).toBeNull();
    expect(first.data?.version_no).toBe(1);
    const snapshot = first.data!.snapshot as { events: Array<{ kind: string }>; selected: Array<{ sha256: string }>;
      missingItems: string[]; reviewItems: string[]; sourceLimitations: string[] };
    expect(snapshot.events.map((e) => e.kind)).toEqual(["SUBMITTED"]);
    expect(snapshot.selected[0].sha256).toBe(hash);
    expect(snapshot.reviewItems).toContain("Pardavėjo gavimo data nežinoma.");
    expect(snapshot.sourceLimitations.join(" ")).toContain("nepatvirtina");
    const archive = unzipSync(await packageZip(a, first.data!));
    expect(archive["irodymai/01-bandymas.pdf"]).toEqual(bytes);
    expect(strFromU8(archive["priedu-sarasas.txt"])).toContain(hash);
    if (process.env.VVTAT_PDF_QA_PATH) writeFileSync(process.env.VVTAT_PDF_QA_PATH, archive["01-ginco-santrauka.pdf"]);
    expect((await a.rpc("create_vvtat_package", args)).data?.id).toBe(first.data!.id);
    expect((await a.rpc("create_vvtat_package", { ...args, p_payload: { ...payload, disputeSummary: "Kita" } })).error).not.toBeNull();
    expect((await b.from("vvtat_packages").select("id").eq("id", first.data!.id)).data).toEqual([]);
    expect((await a.from("vvtat_packages").update({ version_no: 9 } as never).eq("id", first.data!.id)).error).not.toBeNull();
    const second = await Promise.all([a.rpc("create_vvtat_package", { ...args, p_request_id: randomUUID() }),
      a.rpc("create_vvtat_package", { ...args, p_request_id: randomUUID() })]);
    expect(second.filter((result) => !result.error)).toHaveLength(2);
    expect(new Set(second.map((result) => result.data?.version_no)).size).toBe(2);
    expect((await b.rpc("delete_vvtat_package", { p_package_id: first.data!.id })).data).toBe(false);
    expect((await a.rpc("delete_vvtat_package", { p_package_id: first.data!.id })).data).toBe(true);
    expect((await a.from("vvtat_packages").select("id").eq("id", first.data!.id)).data).toEqual([]);
    const latest = second.map((result) => result.data!).sort((x, y) => y.version_no - x.version_no)[0];
    expect((await a.rpc("delete_vvtat_package", { p_package_id: latest.id })).data).toBe(true);
    expect((await a.rpc("create_vvtat_package", { ...args, p_request_id: randomUUID() })).data?.version_no).toBe(4);
    const retained = second.map((result) => result.data!).find((pkg) => pkg.id !== latest.id)!;
    expect((await a.storage.from("purchase-evidence").remove([path])).error).toBeNull();
    expect((await a.from("purchase_documents").delete().eq("id", evidenceId)).error).toBeNull();
    await expect(verifyPackageEvidenceMetadata(a, retained)).rejects.toThrow("įrodymas");
    await expect(packageZip(a, retained)).rejects.toThrow("įrodymas");
    expect((await a.from("purchases").update({ deletion_state: "DELETING" }).eq("id", purchaseId)).error).toBeNull();
    expect((await a.from("purchases").delete().eq("id", purchaseId)).error).toBeNull();
    expect((await a.from("vvtat_packages").select("id").eq("case_id", caseId)).data).toEqual([]);
  } finally {
    await a.storage.from("purchase-evidence").remove([path]);
    await a.from("purchases").update({ deletion_state: "DELETING" }).eq("id", purchaseId);
    await a.from("purchases").delete().eq("id", purchaseId);
    await b.from("purchases").delete().eq("id", foreignPurchaseId);
    await a.auth.signOut(); await b.auth.signOut();
  }
});
