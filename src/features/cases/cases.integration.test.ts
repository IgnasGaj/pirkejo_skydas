import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { todayInVilnius } from "@/lib/date";

type User = { id: string; email: string; password: string };
type Credentials = { url: string; key: string; a: User; b: User };
const file = process.env.E2E_AUTH_CREDENTIALS_FILE;
const credentials = file ? JSON.parse(readFileSync(file, "utf8")) as Credentials : null;
const local = credentials && /^http:\/\/127\.0\.0\.1:\d+$/.test(credentials.url) ? it : it.skip;

local("keeps one pinned case, atomic replay, revision and owner guards", async () => {
  const c = credentials!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const a = createClient<Database>(c.url, c.key, options);
  const b = createClient<Database>(c.url, c.key, options);
  const anonymous = createClient<Database>(c.url, c.key, options);
  expect((await a.auth.signInWithPassword(c.a)).error).toBeNull();
  expect((await b.auth.signInWithPassword(c.b)).error).toBeNull();
  const purchaseId = randomUUID(), complaintId = randomUUID(), versionId = randomUUID();
  const purchase = await a.from("purchases").insert({ id: purchaseId, user_id: c.a.id, product_name: "Bylos testas", seller_name: "Pardavėjas", purchase_date: "2026-10-01", purchase_channel: "PHYSICAL_STORE" }).select("*").single();
  expect(purchase.error).toBeNull();
  try {
    const complaint = await a.from("complaints").insert({ id: complaintId, user_id: c.a.id, purchase_id: purchaseId, family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers: {}, facts: {}, remedy: "REPAIR", purchase_updated_at: purchase.data!.updated_at, template_version: "test", source_version: "test" });
    expect(complaint.error).toBeNull();
    // Fixture only: generated versions are normally created by the signed RPC.
    const sql = `insert into public.complaint_versions(id,user_id,purchase_id,complaint_id,version_no,request_id,document_date,snapshot,sections,plain_text,template_version,source_version) values ('${versionId}','${c.a.id}','${purchaseId}','${complaintId}',1,'${randomUUID()}','2026-10-01','{}','[]','Synthetic document','test','test')`;
    execFileSync("docker", ["exec", "supabase_db_pirkejo-skydas", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "ignore" });
    const requestId = randomUUID();
    const created = await Promise.all([a.rpc("create_tracked_case", { p_version_id: versionId, p_request_id: requestId }), a.rpc("create_tracked_case", { p_version_id: versionId, p_request_id: randomUUID() })]);
    expect(created.every((result) => !result.error)).toBe(true);
    const caseId = created[0].data!.id;
    expect(created[1].data?.id).toBe(caseId);
    expect((await b.from("cases").select("id").eq("id", caseId)).data).toEqual([]);
    expect((await anonymous.from("cases").select("id").eq("id", caseId)).data ?? []).toEqual([]);
    expect((await b.rpc("create_tracked_case", { p_version_id: versionId, p_request_id: randomUUID() })).error).not.toBeNull();
    expect((await a.from("cases").update({ progress: "RESOLVED" } as never).eq("id", caseId)).error).not.toBeNull();
    const today = todayInVilnius();
    const payload = { method: "EMAIL", note: "", receivedOn: today };
    const eventId = randomUUID();
    const args = { p_case_id: caseId, p_request_id: eventId, p_expected_revision: 0, p_kind: "SUBMITTED", p_occurred_on: today, p_payload: payload };
    const submitted = await a.rpc("record_case_event", args);
    expect(submitted.error).toBeNull();
    expect(submitted.data?.received_on).toBe(today);
    expect((await a.rpc("record_case_event", args)).data?.revision).toBe(1);
    expect((await a.rpc("record_case_event", { ...args, p_payload: { ...payload, note: "changed" } })).error).not.toBeNull();
    expect((await a.rpc("record_case_event", { ...args, p_expected_revision: 1 })).error).not.toBeNull();
    expect((await a.rpc("record_case_event", { ...args, p_request_id: randomUUID(), p_kind: "CLOSED", p_expected_revision: 0, p_payload: { note: "" } })).error).not.toBeNull();
    for (const invalidRevision of [null, -1, 500]) {
      const rejected = await a.rpc("record_case_event", { ...args, p_request_id: randomUUID(), p_expected_revision: invalidRevision as number, p_kind: "RESPONSE_RECORDED", p_payload: { summary: "Negali apeiti revizijos", outcome: "OTHER", note: "" } });
      expect(rejected.error).not.toBeNull();
    }
    expect((await a.rpc("record_case_event", { ...args, p_request_id: randomUUID(), p_expected_revision: 1, p_kind: "RESPONSE_RECORDED", p_payload: { summary: "Tekstas", outcome: "OTHER", note: 123 } as never })).error).not.toBeNull();
    expect((await a.rpc("record_case_event", { ...args, p_request_id: randomUUID(), p_expected_revision: 1, p_kind: "RESPONSE_RECORDED", p_payload: { summary: "🙂".repeat(3000), outcome: "OTHER", note: "" } })).error).not.toBeNull();
    expect((await b.rpc("record_case_event", { ...args, p_request_id: randomUUID(), p_expected_revision: 1 })).error).not.toBeNull();
    expect((await a.from("case_events").insert({} as never)).error).not.toBeNull();
    const rows = await a.from("case_events").select("id").eq("case_id", caseId);
    expect(rows.data).toHaveLength(1);
    expect((await b.from("case_events").select("id").eq("case_id", caseId)).data).toEqual([]);
    const failedAfterSummary = await a.rpc("record_case_event", { p_case_id: caseId, p_request_id: null as unknown as string, p_expected_revision: 1, p_kind: "RESPONSE_RECORDED", p_occurred_on: today, p_payload: { summary: "Bandymas", outcome: "OTHER", note: "" } });
    expect(failedAfterSummary.error).not.toBeNull();
    expect((await a.from("cases").select("revision,has_response").eq("id", caseId).single()).data).toMatchObject({ revision: 1, has_response: false });
    const correction = await a.rpc("record_case_event", { p_case_id: caseId, p_request_id: randomUUID(), p_expected_revision: 1, p_kind: "RECEIPT_CORRECTED", p_occurred_on: today, p_payload: { note: "Patikslinta" }, p_target_event_id: rows.data![0].id });
    expect(correction.error).toBeNull();
    expect((await a.rpc("record_case_event", args)).data?.revision).toBe(1);
    const racing = await Promise.all(["MORE_INFORMATION", "OTHER"].map((outcome) => a.rpc("record_case_event", { p_case_id: caseId, p_request_id: randomUUID(), p_expected_revision: 2, p_kind: "RESPONSE_RECORDED", p_occurred_on: today, p_payload: { summary: `Atsakymas ${outcome}`, outcome, note: "" } })));
    expect(racing.filter((result) => !result.error)).toHaveLength(1);
    expect(racing.filter((result) => result.error)).toHaveLength(1);
    expect((await a.from("cases").select("revision,has_response").eq("id", caseId).single()).data).toMatchObject({ revision: 3, has_response: true });
    expect((await a.from("complaints").delete().eq("id", complaintId)).error).not.toBeNull();
    const deleteArgs = { p_case_id: caseId, p_expected_revision: 3, p_request_id: randomUUID() };
    expect((await a.rpc("delete_tracked_case", deleteArgs)).data).toBe(true);
    expect((await a.rpc("delete_tracked_case", deleteArgs)).data).toBe(true);
    expect((await a.rpc("delete_tracked_case", { ...deleteArgs, p_expected_revision: 1 })).error).not.toBeNull();
    expect((await a.from("complaints").delete().eq("id", complaintId)).error).toBeNull();
    const secondComplaintId = randomUUID(), secondVersionId = randomUUID();
    expect((await a.from("complaints").insert({ id: secondComplaintId, user_id: c.a.id, purchase_id: purchaseId, family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers: {}, facts: {}, remedy: "REPAIR", purchase_updated_at: purchase.data!.updated_at, template_version: "test", source_version: "test" })).error).toBeNull();
    const secondSql = `insert into public.complaint_versions(id,user_id,purchase_id,complaint_id,version_no,request_id,document_date,snapshot,sections,plain_text,template_version,source_version) values ('${secondVersionId}','${c.a.id}','${purchaseId}','${secondComplaintId}',1,'${randomUUID()}','2026-10-01','{}','[]','Synthetic document','test','test')`;
    execFileSync("docker", ["exec", "supabase_db_pirkejo-skydas", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", secondSql], { stdio: "ignore" });
    const secondCase = await a.rpc("create_tracked_case", { p_version_id: secondVersionId, p_request_id: randomUUID() });
    expect(secondCase.error).toBeNull();
    expect((await a.from("purchases").update({ deletion_state: "DELETING" }).eq("id", purchaseId)).error).toBeNull();
    expect((await a.from("purchases").delete().eq("id", purchaseId)).error).toBeNull();
    expect((await a.from("cases").select("id").eq("id", secondCase.data!.id)).data).toEqual([]);
  } finally {
    await a.from("purchases").update({ deletion_state: "DELETING" }).eq("id", purchaseId);
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut(); await b.auth.signOut();
  }
});

local("rejects changed creation requests and contradictory lifecycle dates", async () => {
  const c = credentials!;
  const a = createClient<Database>(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await a.auth.signInWithPassword(c.a)).error).toBeNull();
  const purchaseId = randomUUID();
  const purchase = await a.from("purchases").insert({ id: purchaseId, user_id: c.a.id, product_name: "Eigos datos", seller_name: "Pardavėjas", purchase_date: "2026-10-01", purchase_channel: "PHYSICAL_STORE" }).select("*").single();
  expect(purchase.error).toBeNull();
  try {
    async function version() {
      const complaintId = randomUUID(), versionId = randomUUID();
      expect((await a.from("complaints").insert({ id: complaintId, user_id: c.a.id, purchase_id: purchaseId, family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers: {}, facts: {}, remedy: "REPAIR", purchase_updated_at: purchase.data!.updated_at, template_version: "test", source_version: "test" })).error).toBeNull();
      const sql = `insert into public.complaint_versions(id,user_id,purchase_id,complaint_id,version_no,request_id,document_date,generated_at,snapshot,sections,plain_text,template_version,source_version) values ('${versionId}','${c.a.id}','${purchaseId}','${complaintId}',1,'${randomUUID()}','2026-10-01','2026-10-01T08:00:00Z','{}','[]','Synthetic document','test','test')`;
      execFileSync("docker", ["exec", "supabase_db_pirkejo-skydas", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "ignore" });
      return versionId;
    }
    const firstVersion = await version(), secondVersion = await version();
    const firstRequest = randomUUID(), secondRequest = randomUUID();
    const first = await a.rpc("create_tracked_case", { p_version_id: firstVersion, p_request_id: firstRequest });
    const second = await a.rpc("create_tracked_case", { p_version_id: secondVersion, p_request_id: secondRequest });
    expect(first.error).toBeNull(); expect(second.error).toBeNull();
    expect((await a.rpc("create_tracked_case", { p_version_id: firstVersion, p_request_id: firstRequest })).data?.id).toBe(first.data!.id);
    expect((await a.rpc("create_tracked_case", { p_version_id: secondVersion, p_request_id: firstRequest })).error).not.toBeNull();
    const thirdRequest = randomUUID();
    expect((await a.rpc("create_tracked_case", { p_version_id: firstVersion, p_request_id: thirdRequest })).data?.id).toBe(first.data!.id);
    expect((await a.rpc("create_tracked_case", { p_version_id: secondVersion, p_request_id: thirdRequest })).error).not.toBeNull();
    const caseId = first.data!.id;
    async function event(revision: number, kind: string, occurredOn: string, payload: Record<string, string>, target?: string) {
      return a.rpc("record_case_event", { p_case_id: caseId, p_request_id: randomUUID(), p_expected_revision: revision, p_kind: kind, p_occurred_on: occurredOn, p_payload: payload, p_target_event_id: target ?? null });
    }
    expect((await event(0, "SUBMITTED", "2026-10-01", { method: "EMAIL", receivedOn: "2026-10-01", note: "" })).error).toBeNull();
    const submission = (await a.from("case_events").select("id").eq("case_id", caseId).eq("kind", "SUBMITTED").single()).data!;
    expect((await event(1, "CLOSED", "2026-10-02", { note: "" })).error).toBeNull();
    expect((await event(2, "RECEIPT_CORRECTED", "2026-10-03", { note: "" }, submission.id)).error).not.toBeNull();
    expect((await event(2, "REOPENED", "2026-10-01", { note: "" })).error).not.toBeNull();
    expect((await event(2, "REOPENED", "2026-10-02", { note: "" })).error).toBeNull();
    expect((await event(3, "SERVICE_STARTED", "2026-10-04", { note: "", reference: "S-1", promisedOn: "2026-10-04" })).error).toBeNull();
    expect((await event(4, "CLOSED", "2026-10-02", { note: "" })).error).not.toBeNull();
    expect((await event(4, "RESOLVED", "2026-10-04", { note: "", outcome: "REPAIRED" })).error).not.toBeNull();
    expect((await event(4, "CLOSED", "2026-10-04", { note: "" })).error).toBeNull();
    expect((await event(5, "REOPENED", "2026-10-03", { note: "" })).error).not.toBeNull();
    expect((await event(5, "REOPENED", "2026-10-04", { note: "" })).error).toBeNull();
    expect((await event(6, "SERVICE_RETURNED", "2026-10-03", { note: "", result: "Atgauta" })).error).not.toBeNull();
    expect((await event(6, "SERVICE_RETURNED", "2026-10-04", { note: "", result: "Atgauta" })).error).toBeNull();
    expect((await event(7, "SERVICE_STARTED", "2026-10-02", { note: "", reference: "S-2" })).error).not.toBeNull();
    expect((await event(7, "SERVICE_STARTED", "2026-10-04", { note: "", reference: "S-2" })).error).toBeNull();
    expect((await event(8, "RESPONSE_RECORDED", "2026-10-02", { note: "🙂".repeat(500), summary: "Ą".repeat(1000), outcome: "OTHER" })).error).toBeNull();
    expect((await a.from("cases").select("revision,progress").eq("id", caseId).single()).data).toMatchObject({ revision: 9, progress: "IN_SERVICE" });
    expect((await a.from("case_events").select("id").eq("case_id", caseId)).data).toHaveLength(9);
  } finally {
    await a.from("purchases").update({ deletion_state: "DELETING" }).eq("id", purchaseId);
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut();
  }
});
