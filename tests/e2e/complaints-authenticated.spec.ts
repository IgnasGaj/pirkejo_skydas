import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";

const enabled = process.env.E2E_AUTH_LOCAL === "1" && Boolean(process.env.E2E_AUTH_CREDENTIALS_FILE);
test.skip(!enabled, "Requires disposable local Supabase and ordinary test accounts");
type User = { id: string; email: string; password: string };
type Credentials = { url: string; key: string; a: User; b: User };
function localDate(daysAgo: number) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() - daysAgo * 86_400_000));
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
async function login(page: Page, user: User) {
  await page.goto("/login");
  const form = page.getByRole("heading", { name: "Prisijungti" }).locator("..");
  await form.getByLabel("El. paštas").fill(user.email);
  await form.getByLabel("Slaptažodis").fill(user.password);
  await form.getByRole("button", { name: "Prisijungti" }).click();
  await expect(page).toHaveURL(/\/purchases(?:\?|$)/);
}

test("private drafts, retry-safe generation, exports, ownership and stale facts on a disposable backend", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  expect(credentials.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const a = createClient<Database>(credentials.url, credentials.key, options);
  const b = createClient<Database>(credentials.url, credentials.key, options);
  const anon = createClient<Database>(credentials.url, credentials.key, options);
  expect((await a.auth.signInWithPassword(credentials.a)).error).toBeNull();
  expect((await b.auth.signInWithPassword(credentials.b)).error).toBeNull();
  const purchaseId = randomUUID();
  let complaintId: string | undefined;
  let evidencePath: string | undefined;
  let bEvidencePath: string | undefined;
  let bPurchaseId: string | undefined;
  const purchaseDate = localDate(4);
  const receivedDate = localDate(3);
  const today = localDate(0);
  try {
    expect((await a.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id, product_name: "Bandomoji kėdė", seller_name: "Bandymų parduotuvė", purchase_date: purchaseDate, received_date: receivedDate, purchase_channel: "DISTANCE", price_cents: 4999 })).error).toBeNull();
    await login(page, credentials.a);
    const answers = { buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW", purchasedAt: purchaseDate, deliveredAt: receivedDate, defectDetectedAt: localDate(2), apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO" };
    const facts = { consumerName: "Jūratė Ąžuolaitė", consumerEmail: "jurate@example.test", sellerName: "Bandymų parduotuvė", sellerContact: "", productName: "Bandomoji kėdė", purchaseDate, receivedDate, purchaseChannel: "DISTANCE", referenceNumber: "UŽS-1", priceCents: 4999, documentDate: today, defectDescription: "Kėdės koja yra sulūžusi.", defectDiscoveredAt: localDate(2), reductionCents: null, reductionExplanation: "", physicalReason: null, confirmedNotMinor: false, alternativeProof: "Mokėjimo įrašas", evidenceIds: [] };
    const api = `/api/purchases/${purchaseId}/complaints`;
    const create = { operation: "save", requestId: randomUUID(), family: "DEFECTIVE_PRODUCT", answers, facts, remedy: "REPAIR" };
    const first = await page.request.post(api, { data: create });
    expect(first.status(), await first.text()).toBe(200);
    const created = await first.json();
    complaintId = created.id;
    const retry = await page.request.post(api, { data: create });
    expect((await retry.json()).id).toBe(complaintId);
    const editedRetry = await page.request.post(api, { data: { ...create, facts: { ...facts, consumerName: "Kitas Vardas" } } });
    expect(editedRetry.status()).toBe(409);
    expect(await editedRetry.json()).toMatchObject({ code: "CREATION_CHANGED", id: complaintId });
    const recovered = await page.request.get(`${api}?complaintId=${complaintId}`);
    expect(recovered.status()).toBe(200);
    expect((await recovered.json()).draft.facts.consumerName).toBe(facts.consumerName);
    expect((await a.from("complaints").select("id").eq("purchase_id", purchaseId)).data).toHaveLength(1);
    const oversized = await page.request.post(api, { data: { ...create, requestId: randomUUID(), facts: { ...facts, defectDescription: "漢".repeat(4000), reductionExplanation: "漢".repeat(1000), alternativeProof: "漢".repeat(500) } } });
    expect(oversized.status()).toBe(400);
    expect((await oversized.json()).code).toBe("INVALID_FIELD");
    const longFacts = { ...facts, defectDescription: `Kėdės trūkumas: ${"ą".repeat(1500)}` };
    const longSave = await page.request.post(api, { data: { ...create, requestId: randomUUID(), facts: longFacts } });
    expect(longSave.status(), await longSave.text()).toBe(200);
    const longDraft = await longSave.json();
    const longGenerate = await page.request.post(api, { data: { operation: "generate", complaintId: longDraft.id, expectedVersion: 1, requestId: randomUUID() } });
    expect(longGenerate.status(), await longGenerate.text()).toBe(200);
    const longText = await page.request.get(`/api/purchases/${purchaseId}/complaints/${longDraft.id}/versions/${(await longGenerate.json()).id}?format=txt`);
    expect(await longText.text()).toContain("ą".repeat(1500));
    expect((await page.request.post(api, { data: { operation: "delete", complaintId: longDraft.id, requestId: randomUUID() } })).status()).toBe(200);

    expect((await b.from("complaints").select("id").eq("id", complaintId!)).data).toEqual([]);
    expect((await anon.from("complaints").select("id").eq("id", complaintId!)).data).toEqual([]);
    expect((await b.from("complaints").insert({ id: randomUUID(), user_id: credentials.b.id, purchase_id: purchaseId, family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers: {}, facts: {}, remedy: "REPAIR", purchase_updated_at: new Date().toISOString(), template_version: "x", source_version: "x" })).error).not.toBeNull();
    const generatedId = randomUUID();
    const generate = { operation: "generate", complaintId, expectedVersion: created.draft_version, requestId: generatedId };
    const responses = await Promise.all([page.request.post(api, { data: generate }), page.request.post(api, { data: generate })]);
    expect(responses.map((response) => response.status())).toEqual([200, 200]);
    const versionIds = await Promise.all(responses.map(async (response) => (await response.json()).id));
    expect(new Set(versionIds).size).toBe(1);
    const versionId = versionIds[0];
    expect((await a.from("complaint_versions").select("id").eq("complaint_id", complaintId!)).data).toHaveLength(1);
    expect((await b.from("complaint_versions").select("id").eq("id", versionId)).data).toEqual([]);
    expect((await anon.from("complaint_versions").select("id").eq("id", versionId)).data).toEqual([]);
    expect((await b.rpc("generate_signed_complaint_version", { p_payload: JSON.stringify({ complaintId }), p_signature: "forged" })).error).not.toBeNull();
    expect((await a.rpc("generate_signed_complaint_version", { p_payload: JSON.stringify({ complaintId }), p_signature: "forged" })).error).not.toBeNull();
    expect((await a.from("complaint_versions").insert({ user_id: credentials.a.id, purchase_id: purchaseId, complaint_id: complaintId!, request_id: randomUUID(), version_no: 2, document_date: today, snapshot: {}, sections: [], plain_text: "forged", template_version: "x", source_version: "x" })).error).not.toBeNull();
    expect((await a.from("complaint_versions").update({ plain_text: "changed" } as never).eq("id", versionId).select("id")).data).toEqual([]);
    const secondaryAnswers = { ...answers, writtenSellerContact: "YES", sellerClaim: { receivedAt: localDate(1), requestedRemedy: "REPAIR" }, sellerOutcome: "REPAIR_FAILED_OR_DEFECT_RECURRED" };
    const reductionFacts = { ...facts, reductionCents: 1000, reductionExplanation: "Po taisymo kėdė tebėra netinkama naudoti." };
    const unsupportedReduction = await page.request.post(api, { data: { ...create, requestId: randomUUID(), facts: reductionFacts, remedy: "PRICE_REDUCTION" } });
    expect(unsupportedReduction.status()).toBe(400);
    const reductionSave = await page.request.post(api, { data: { ...create, requestId: randomUUID(), answers: secondaryAnswers, facts: reductionFacts, remedy: "PRICE_REDUCTION" } });
    expect(reductionSave.status(), await reductionSave.text()).toBe(200);
    const reductionDraft = await reductionSave.json();
    await page.goto(`/purchases/${purchaseId}/complaints/${reductionDraft.id}`);
    await expect(page.getByRole("heading", { name: "Dokumento peržiūra" })).toBeVisible();
    await expect(page.getByText("Mano žiniomis, trūkumas nėra nedidelis", { exact: false })).toHaveCount(0);
    const reductionGenerate = await page.request.post(api, { data: { operation: "generate", complaintId: reductionDraft.id, expectedVersion: 1, requestId: randomUUID() } });
    expect(reductionGenerate.status(), await reductionGenerate.text()).toBe(200);
    const reductionVersion = await reductionGenerate.json();
    const reductionText = await page.request.get(`/api/purchases/${purchaseId}/complaints/${reductionDraft.id}/versions/${reductionVersion.id}?format=txt`);
    expect(await reductionText.text()).toContain("trūkumas išliko arba atsirado pakartotinai");
    const invalidTermination = await page.request.post(api, { data: { ...create, requestId: randomUUID(), answers: secondaryAnswers, facts: reductionFacts, remedy: "TERMINATION_REFUND" } });
    expect(invalidTermination.status()).toBe(400);
    const terminationSave = await page.request.post(api, { data: { ...create, requestId: randomUUID(), answers: secondaryAnswers, facts: { ...facts, confirmedNotMinor: true }, remedy: "TERMINATION_REFUND" } });
    expect(terminationSave.status(), await terminationSave.text()).toBe(200);
    const terminationDraft = await terminationSave.json();
    await page.goto(`/purchases/${purchaseId}/complaints/${terminationDraft.id}`);
    await expect(page.getByText("Mano žiniomis, trūkumas nėra nedidelis", { exact: false })).toBeVisible();
    const terminationGenerate = await page.request.post(api, { data: { operation: "generate", complaintId: terminationDraft.id, expectedVersion: 1, requestId: randomUUID() } });
    expect(terminationGenerate.status(), await terminationGenerate.text()).toBe(200);
    const terminationVersion = await terminationGenerate.json();
    const terminationText = await page.request.get(`/api/purchases/${purchaseId}/complaints/${terminationDraft.id}/versions/${terminationVersion.id}?format=txt`);
    expect(await terminationText.text()).toContain("nutraukti pirkimo–pardavimo sutartį");
    const unknownAnswers = { ...answers, defectDetectedAt: undefined };
    for (const defectDiscoveredAt of ["2030-01-01", localDate(5), localDate(2)]) {
      const invalidDate = await page.request.post(api, { data: { ...create, requestId: randomUUID(), answers: unknownAnswers, facts: { ...facts, defectDiscoveredAt } } });
      expect(invalidDate.status()).toBe(400);
    }
    const unknownSave = await page.request.post(api, { data: { ...create, requestId: randomUUID(), answers: unknownAnswers, facts: { ...facts, defectDiscoveredAt: null } } });
    expect(unknownSave.status(), await unknownSave.text()).toBe(200);
    const unknownDraft = await unknownSave.json();
    const knownSave = await page.request.post(api, { data: { ...create, complaintId: unknownDraft.id, expectedVersion: 1, requestId: randomUUID(), answers, facts } });
    expect(knownSave.status(), await knownSave.text()).toBe(200);
    const base = `/api/purchases/${purchaseId}/complaints/${complaintId}/versions/${versionId}`;
    const txt = await page.request.get(`${base}?format=txt`);
    expect(txt.status()).toBe(200);
    expect(txt.headers()["content-type"]).toContain("text/plain");
    expect(txt.headers()["cache-control"]).toContain("no-store");
    expect(await txt.text()).toContain("Jūratė Ąžuolaitė");
    const pdf = await page.request.get(`${base}?format=pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(Buffer.from(await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await page.goto(`/purchases/${purchaseId}/complaints/${complaintId}`);
    await expect(page.getByText("Versija 1", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Atsisiųsti PDF" })).toBeVisible();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Unavailable"); } } }));
    await page.getByRole("button", { name: "Kopijuoti tekstą" }).click();
    await expect(page.getByText("Pažymėkite tekstą žemiau", { exact: false })).toBeVisible();
    await page.getByText("Peržiūrėti dokumentą", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Versijos 1 tekstas" })).toHaveValue(/Jūratė Ąžuolaitė/);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }));
    await page.getByRole("button", { name: "Kopijuoti tekstą" }).click();
    await expect(page.getByText("Tekstas nukopijuotas.")).toBeVisible();
    const bContext = await browser.newContext();
    const bPage = await bContext.newPage();
    try {
      await login(bPage, credentials.b);
      expect((await bPage.request.get(base)).status()).toBe(404);
      await bPage.goto(`/purchases/${purchaseId}/complaints/${complaintId}`);
      await expect(bPage.getByText("Pirkinio rasti nepavyko.")).toBeVisible();
    } finally { await bContext.close(); }
    const anonymous = await browser.newContext();
    try { expect((await anonymous.request.get(base)).status()).toBe(401); } finally { await anonymous.close(); }

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9w3ZkAAAAASUVORK5CYII=", "base64");
    bPurchaseId = randomUUID();
    expect((await b.from("purchases").insert({ id: bPurchaseId, user_id: credentials.b.id, product_name: "B pirkinys", seller_name: "B pardavėjas", purchase_date: purchaseDate, purchase_channel: "PHYSICAL_STORE" })).error).toBeNull();
    bEvidencePath = `${credentials.b.id}/${bPurchaseId}/${randomUUID()}.png`;
    expect((await b.storage.from("purchase-evidence").upload(bEvidencePath, png, { contentType: "image/png" })).error).toBeNull();
    const bDocument = await b.from("purchase_documents").insert({ user_id: credentials.b.id, purchase_id: bPurchaseId, document_type: "RECEIPT", original_filename: "foreign.png", storage_path: bEvidencePath, mime_type: "image/png", size_bytes: png.length }).select("id").single();
    expect(bDocument.error).toBeNull();
    const foreignSave = await page.request.post(api, { data: { ...create, requestId: randomUUID(), facts: { ...facts, evidenceIds: [bDocument.data!.id] } } });
    expect(foreignSave.status()).toBe(409);
    expect((await foreignSave.json()).code).toBe("MISSING_EVIDENCE");
    evidencePath = `${credentials.a.id}/${purchaseId}/${randomUUID()}.png`;
    expect((await a.storage.from("purchase-evidence").upload(evidencePath, png, { contentType: "image/png" })).error).toBeNull();
    const document = await a.from("purchase_documents").insert({ user_id: credentials.a.id, purchase_id: purchaseId, document_type: "RECEIPT", original_filename: "proof.png", storage_path: evidencePath, mime_type: "image/png", size_bytes: png.length }).select("id").single();
    expect(document.error).toBeNull();
    const evidenceSave = await page.request.post(api, { data: { ...create, requestId: randomUUID(), facts: { ...facts, evidenceIds: [document.data!.id] } } });
    expect(evidenceSave.status(), await evidenceSave.text()).toBe(200);
    const evidenceDraft = await evidenceSave.json();
    expect((await a.storage.from("purchase-evidence").remove([evidencePath])).error).toBeNull();
    evidencePath = undefined;
    const inaccessibleEvidenceGeneration = await page.request.post(api, { data: { operation: "generate", complaintId: evidenceDraft.id, expectedVersion: 1, requestId: randomUUID() } });
    expect(inaccessibleEvidenceGeneration.status()).toBe(409);
    expect((await a.from("complaint_versions").select("id").eq("complaint_id", evidenceDraft.id)).data).toEqual([]);
    expect((await a.from("purchase_documents").delete().eq("id", document.data!.id).select("id")).data).toHaveLength(1);
    const deletedEvidenceGeneration = await page.request.post(api, { data: { operation: "generate", complaintId: evidenceDraft.id, expectedVersion: 1, requestId: randomUUID() } });
    expect(deletedEvidenceGeneration.status()).toBe(409);
    expect((await a.from("complaint_versions").select("id").eq("complaint_id", evidenceDraft.id)).data).toEqual([]);
    await a.from("complaints").delete().eq("id", evidenceDraft.id);

    const currentSave = await page.request.post(api, { data: { ...create, complaintId, expectedVersion: 1, requestId: randomUUID(), facts: { ...facts, consumerName: "Jūratė Nauja" } } });
    expect(currentSave.status(), await currentSave.text()).toBe(200);
    const staleSave = await page.request.post(api, { data: { ...create, complaintId, expectedVersion: 1, requestId: randomUUID(), facts: { ...facts, consumerName: "Jūratė Pasenusi" } } });
    expect(staleSave.status()).toBe(409);
    const regenerate = await page.request.post(api, { data: { ...generate, expectedVersion: 2, requestId: randomUUID() } });
    expect(regenerate.status(), await regenerate.text()).toBe(200);
    expect((await regenerate.json()).version_no).toBe(2);
    const updated = await a.from("purchases").update({ seller_name: "Naujas pardavėjas", purchase_date: localDate(5), received_date: localDate(4), price_cents: 5999 }).eq("id", purchaseId).select("updated_at").single();
    expect(updated.error).toBeNull();
    const staleGeneration = await page.request.post(api, { data: { ...generate, requestId: randomUUID() } });
    expect(staleGeneration.status()).toBe(400);
    await page.goto(`/purchases/${purchaseId}/complaints/${complaintId}`);
    await expect(page.getByRole("button", { name: "Pakartoti teisinę patikrą" })).toBeVisible();
    const historical = (await a.from("complaint_versions").select("plain_text,snapshot").eq("id", versionId).single()).data;
    expect(historical?.plain_text).toContain("Bandymų parduotuvė");
    const reboundFacts = { ...facts, consumerName: "Jūratė Nauja", sellerName: "Naujas pardavėjas", purchaseDate: localDate(5), receivedDate: localDate(4), priceCents: 5999 };
    const reboundAnswers = { ...answers, purchasedAt: localDate(5), deliveredAt: localDate(4) };
    const staleRebind = await page.request.post(api, { data: { ...create, complaintId, expectedVersion: 1, rebind: true, requestId: randomUUID(), answers: reboundAnswers, facts: reboundFacts } });
    expect(staleRebind.status()).toBe(409);
    const rebindPayload = { ...create, complaintId, expectedVersion: 2, rebind: true, requestId: randomUUID(), answers: reboundAnswers, facts: reboundFacts };
    const rebound = await page.request.post(api, { data: rebindPayload });
    expect(rebound.status(), await rebound.text()).toBe(200);
    expect((await rebound.json()).draft_version).toBe(3);
    const droppedResponseRetry = await page.request.post(api, { data: rebindPayload });
    expect(droppedResponseRetry.status(), await droppedResponseRetry.text()).toBe(200);
    expect((await droppedResponseRetry.json()).draft_version).toBe(3);
    const changedRetry = await page.request.post(api, { data: { ...rebindPayload, facts: { ...reboundFacts, consumerName: "Kita" } } });
    expect(changedRetry.status()).toBe(409);
    const versionThree = await page.request.post(api, { data: { ...generate, expectedVersion: 3, requestId: randomUUID() } });
    expect(versionThree.status(), await versionThree.text()).toBe(200);
    expect((await versionThree.json()).version_no).toBe(3);
    expect((await a.from("complaint_versions").select("plain_text,snapshot").eq("id", versionId).single()).data).toEqual(historical);
    const notes = await a.from("purchases").update({ notes: "Tik pastaba" }).eq("id", purchaseId).select("updated_at").single();
    expect(notes.error).toBeNull();
    const concurrentPurchase = await a.rpc("save_reviewed_complaint", {
      p_complaint_id: complaintId!, p_expected_version: 3, p_purchase_updated_at: updated.data!.updated_at,
      p_rebind: true, p_request_id: randomUUID(), p_family: "DEFECTIVE_PRODUCT",
      p_answers: reboundAnswers, p_facts: reboundFacts, p_remedy: "REPAIR",
      p_template_version: "2026-10-03.1", p_source_version: "2026-10-03"
    });
    expect(concurrentPurchase.error).not.toBeNull();
    const notesBlocked = await page.request.post(api, { data: { ...create, complaintId, expectedVersion: 3, requestId: randomUUID(), answers: reboundAnswers, facts: reboundFacts } });
    expect(notesBlocked.status()).toBe(409);
    const notesRebind = await page.request.post(api, { data: { ...create, complaintId, expectedVersion: 3, rebind: true, requestId: randomUUID(), answers: reboundAnswers, facts: reboundFacts } });
    expect(notesRebind.status(), await notesRebind.text()).toBe(200);
    expect((await notesRebind.json()).draft_version).toBe(4);
    const staleReplay = await page.request.post(api, { data: { ...generate, requestId: generatedId } });
    expect(staleReplay.status(), await staleReplay.text()).toBe(200);
    expect((await staleReplay.json()).id).toBe(versionId);
    expect((await a.from("complaints").delete().eq("id", complaintId!).select("id")).data).toHaveLength(1);
    complaintId = undefined;
    expect((await a.from("complaint_versions").select("id").eq("id", versionId)).data).toEqual([]);
  } finally {
    if (complaintId) await a.from("complaints").delete().eq("id", complaintId);
    if (evidencePath) await a.storage.from("purchase-evidence").remove([evidencePath]);
    if (bEvidencePath) await b.storage.from("purchase-evidence").remove([bEvidencePath]);
    if (bPurchaseId) await b.from("purchases").delete().eq("id", bPurchaseId);
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut(); await b.auth.signOut();
  }
});

test("mobile internal navigation retains unsaved complaint facts until explicit discard", async ({ page }) => {
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  const a = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await a.auth.signInWithPassword(credentials.a)).error).toBeNull();
  const purchaseId = randomUUID();
  const complaintId = randomUUID();
  const purchaseDate = localDate(4), receivedDate = localDate(3), discovered = localDate(2), today = localDate(0);
  try {
    const created = await a.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id, product_name: "Bandomoji kėdė", seller_name: "Bandymų parduotuvė", purchase_date: purchaseDate, received_date: receivedDate, purchase_channel: "DISTANCE" }).select("updated_at").single();
    expect(created.error).toBeNull();
    const facts = { consumerName: "Senas Vardas", consumerEmail: "old@example.test", sellerName: "Bandymų parduotuvė", sellerContact: "", productName: "Bandomoji kėdė", purchaseDate, receivedDate, purchaseChannel: "DISTANCE", referenceNumber: "", priceCents: null, documentDate: today, defectDescription: "Kėdės koja yra sulūžusi.", defectDiscoveredAt: discovered, reductionCents: null, reductionExplanation: "", physicalReason: null, confirmedNotMinor: false, alternativeProof: "", evidenceIds: [] };
    const answers = { buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW", purchasedAt: purchaseDate, deliveredAt: receivedDate, defectDetectedAt: discovered, apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO" };
    expect((await a.from("complaints").insert({ id: complaintId, user_id: credentials.a.id, purchase_id: purchaseId, family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers, facts, remedy: "REPAIR", purchase_updated_at: created.data!.updated_at, template_version: "test", source_version: "test" })).error).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, credentials.a);
    await page.goto(`/purchases/${purchaseId}/complaints/${complaintId}`);
    await page.getByLabel("Vardas ir pavardė").fill("Mano Vardas");
    page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("neišsaugotų pakeitimų"); await dialog.dismiss(); });
    await page.getByRole("link", { name: "← Pirkinys" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}/complaints/${complaintId}$`));
    await expect(page.getByLabel("Vardas ir pavardė")).toHaveValue("Mano Vardas");
    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await page.getByRole("link", { name: "← Pirkinys" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}$`));
  } finally {
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut();
  }
});

test("new tabs keep unsaved facts dirty; repeated saves rearm unload and Back; generation uses displayed saved facts", async ({ page, context }) => {
  test.setTimeout(120_000);
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  const a = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await a.auth.signInWithPassword(credentials.a)).error).toBeNull();
  const purchaseId = randomUUID(), complaintId = randomUUID();
  const purchaseDate = localDate(4), receivedDate = localDate(3), discovered = localDate(2), today = localDate(0);
  try {
    const created = await a.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id, product_name: "Bandymo kėdė", seller_name: "Bandymų parduotuvė", purchase_date: purchaseDate, received_date: receivedDate, purchase_channel: "DISTANCE" }).select("updated_at").single();
    expect(created.error).toBeNull();
    const facts = { consumerName: "Išsaugotas Vardas", consumerEmail: "old@example.test", sellerName: "Bandymų parduotuvė", sellerContact: "", productName: "Bandymo kėdė", purchaseDate, receivedDate, purchaseChannel: "DISTANCE", referenceNumber: "", priceCents: null, documentDate: today, defectDescription: "Kėdės koja yra sulūžusi.", defectDiscoveredAt: discovered, reductionCents: null, reductionExplanation: "", physicalReason: null, confirmedNotMinor: false, alternativeProof: "", evidenceIds: [] };
    const answers = { buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW", purchasedAt: purchaseDate, deliveredAt: receivedDate, defectDetectedAt: discovered, apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO" };
    expect((await a.from("complaints").insert({ id: complaintId, user_id: credentials.a.id, purchase_id: purchaseId, family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers, facts, remedy: "REPAIR", purchase_updated_at: created.data!.updated_at, template_version: "test", source_version: "test" })).error).toBeNull();
    await login(page, credentials.a);
    await page.goto(`/purchases/${purchaseId}/complaints/${complaintId}`);
    const name = page.getByLabel("Vardas ir pavardė");
    const generate = page.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" });
    const editLink = page.getByRole("link", { name: "pirkinio įraše" });
    await name.fill("Neišsaugotas Vardas");
    await expect(generate).toBeDisabled();
    await page.evaluate((id) => { const link = document.createElement("a"); link.href = `/purchases/${id}/edit`; link.target = "_blank"; link.textContent = "Bandymo naujas skirtukas"; document.body.append(link); }, purchaseId);
    for (const [link, modifiers] of [
      [page.getByRole("link", { name: "Bandymo naujas skirtukas" }), undefined],
      [editLink, ["ControlOrMeta"] as const], [editLink, ["Shift"] as const]
    ] as const) {
      const opened = context.waitForEvent("page");
      await link.click(modifiers ? { modifiers: [...modifiers] } : undefined);
      await (await opened).close();
      await expect(name).toHaveValue("Neišsaugotas Vardas");
      await expect(generate).toBeDisabled();
    }
    await expect(page.getByText("Vartotojas: Neišsaugotas Vardas", { exact: false })).toBeVisible();
    page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("neišsaugotų pakeitimų"); await dialog.dismiss(); });
    await page.getByRole("link", { name: "← Pirkinys" }).click();
    await expect(name).toHaveValue("Neišsaugotas Vardas");
    const historyLength = await page.evaluate(() => history.length);
    for (const savedName of ["Pirmas išsaugotas", "Antras išsaugotas"]) {
      await name.fill(savedName);
      await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
      await expect(page.getByText("Juodraštis išsaugotas.")).toBeVisible();
      await expect(generate).toBeEnabled();
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
      await name.fill(`${savedName} neišsaugota`);
      expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
      await expect(generate).toBeDisabled();
      page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("neišsaugotų pakeitimų"); await dialog.dismiss(); });
      await page.getByRole("link", { name: "← Pirkinys" }).click();
      await expect(name).toHaveValue(`${savedName} neišsaugota`);
      if (savedName === "Pirmas išsaugotas") {
        const warning = page.waitForEvent("dialog");
        await page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
        const dialog = await warning;
        expect(dialog.type()).toBe("beforeunload");
        await dialog.dismiss();
        await expect(name).toHaveValue(`${savedName} neišsaugota`);
      }
      page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("neišsaugotų pakeitimų"); await dialog.dismiss(); });
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
      await expect(name).toHaveValue(`${savedName} neišsaugota`);
    }
    await name.fill("Galutinis išsaugotas");
    await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
    await expect(generate).toBeEnabled();
    await expect(page.getByText("Vartotojas: Galutinis išsaugotas", { exact: false })).toBeVisible();
    expect((await a.from("complaints").select("facts").eq("id", complaintId).single()).data?.facts).toMatchObject({ consumerName: "Galutinis išsaugotas" });
    await generate.click();
    await expect(page.getByText("Dokumentas parengtas.", { exact: false })).toBeVisible();
    const generated = await a.from("complaint_versions").select("snapshot,plain_text").eq("complaint_id", complaintId).single();
    expect(generated.error).toBeNull();
    expect(generated.data?.snapshot).toMatchObject({ facts: { consumerName: "Galutinis išsaugotas" } });
    expect(generated.data?.plain_text).toContain("Galutinis išsaugotas");
    const closingPage = await context.newPage();
    await closingPage.goto(page.url());
    await closingPage.getByLabel("Vardas ir pavardė").fill("Uždarymo bandymas");
    const closeWarning = closingPage.waitForEvent("dialog");
    await closingPage.close({ runBeforeUnload: true });
    const closeDialog = await closeWarning;
    expect(closeDialog.type()).toBe("beforeunload");
    await closeDialog.dismiss();
    expect(closingPage.isClosed()).toBe(false);
    await expect(closingPage.getByLabel("Vardas ir pavardė")).toHaveValue("Uždarymo bandymas");
    await closingPage.close();
    await name.fill("Dar vienas neišsaugotas");
    page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("neišsaugotų pakeitimų"); await dialog.accept(); });
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
    await expect(page).not.toHaveURL(new RegExp(`/complaints/${complaintId}$`));
  } finally {
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut();
  }
});

test("signed generation waits for an evidence deletion transaction and rejects its tombstone", async ({ page }) => {
  test.setTimeout(60_000);
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  const a = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await a.auth.signInWithPassword(credentials.a)).error).toBeNull();
  const purchaseId = randomUUID(), documentId = randomUUID();
  const path = `${credentials.a.id}/${purchaseId}/${documentId}.png`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9w3ZkAAAAASUVORK5CYII=", "base64");
  const purchaseDate = localDate(4), receivedDate = localDate(3), discovered = localDate(2), today = localDate(0);
  let locker: ReturnType<typeof spawn> | undefined;
  try {
    const purchase = await a.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id, product_name: "Bandymo kėdė", seller_name: "Bandymų parduotuvė", purchase_date: purchaseDate, received_date: receivedDate, purchase_channel: "DISTANCE" }).select("updated_at").single();
    expect(purchase.error).toBeNull();
    expect((await a.storage.from("purchase-evidence").upload(path, png, { contentType: "image/png" })).error).toBeNull();
    expect((await a.from("purchase_documents").insert({ id: documentId, user_id: credentials.a.id, purchase_id: purchaseId, document_type: "RECEIPT", original_filename: "race.png", storage_path: path, mime_type: "image/png", size_bytes: png.length })).error).toBeNull();
    await login(page, credentials.a);
    const facts = { consumerName: "Jūratė Bandymų", consumerEmail: "jurate@example.test", sellerName: "Bandymų parduotuvė", sellerContact: "", productName: "Bandymo kėdė", purchaseDate, receivedDate, purchaseChannel: "DISTANCE", referenceNumber: "", priceCents: null, documentDate: today, defectDescription: "Kėdės koja yra sulūžusi.", defectDiscoveredAt: discovered, reductionCents: null, reductionExplanation: "", physicalReason: null, confirmedNotMinor: false, alternativeProof: "", evidenceIds: [documentId] };
    const answers = { buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW", purchasedAt: purchaseDate, deliveredAt: receivedDate, defectDetectedAt: discovered, apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO" };
    const api = `/api/purchases/${purchaseId}/complaints`;
    const saved = await page.request.post(api, { data: { operation: "save", requestId: randomUUID(), family: "DEFECTIVE_PRODUCT", answers, facts, remedy: "REPAIR" } });
    expect(saved.status(), await saved.text()).toBe(200);
    const complaintId = (await saved.json()).id;
    locker = spawn("docker", ["exec", "-i", "supabase_db_pirkejo-skydas", "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres"], { stdio: ["pipe", "pipe", "pipe"] });
    const locked = new Promise<void>((resolve, reject) => {
      locker!.stdout!.on("data", (chunk: Buffer) => { if (chunk.toString().includes(documentId)) resolve(); });
      locker!.on("error", reject);
      locker!.on("exit", (code) => { if (code) reject(new Error(`Lock process exited ${code}`)); });
    });
    locker.stdin!.write(`begin; select id from public.purchase_documents where id='${documentId}' for update;\n`);
    await locked;
    let completed = false;
    const generation = page.request.post(api, { data: { operation: "generate", complaintId, expectedVersion: 1, requestId: randomUUID() } }).finally(() => { completed = true; });
    await page.waitForTimeout(300);
    expect(completed).toBe(false);
    locker.stdin!.write(`update public.purchase_documents set upload_state='DELETING' where id='${documentId}'; commit;\n\q\n`);
    const response = await generation;
    expect(response.status()).toBe(409);
    expect((await a.from("complaint_versions").select("id").eq("complaint_id", complaintId)).data).toEqual([]);
  } finally {
    locker?.stdin?.write("rollback;\n\q\n"); locker?.kill();
    await a.storage.from("purchase-evidence").remove([path]);
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut();
  }
});

test("reviewed defect and distance withdrawal wizards save and generate private documents", async ({ page }) => {
  test.setTimeout(120_000);
  // Chromium on localhost normally has randomUUID. Remove it before every page load
  // to exercise the same missing-API condition as the reported browser session.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  });
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  expect(credentials.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const client = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword(credentials.a)).error).toBeNull();
  const purchaseId = randomUUID();
  const purchaseDate = localDate(4);
  const receivedDate = localDate(3);
  try {
    expect((await client.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id, product_name: "Bandomoji lempa", seller_name: "Bandymų parduotuvė", purchase_date: purchaseDate, received_date: receivedDate, purchase_channel: "DISTANCE", price_cents: 3500 })).error).toBeNull();
    await login(page, credentials.a);
    await page.goto(`/purchases/${purchaseId}/complaints/new?flow=defect`);
    expect(await page.evaluate(() => ({ uuid: typeof crypto.randomUUID, randomBytes: typeof crypto.getRandomValues }))).toEqual({ uuid: "undefined", randomBytes: "function" });
    for (const label of ["Aš kaip privatus asmuo", "Parduotuvės / įmonės", "Fizinė prekė", "Nauja"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByLabel("Data", { exact: true }).fill(receivedDate);
    await page.getByRole("button", { name: "Toliau" }).click();
    await page.getByLabel("Data", { exact: true }).fill(localDate(2));
    await page.getByRole("button", { name: "Toliau" }).click();
    for (const label of ["Prekė sugedo arba trūkumas atsirado įprastai naudojant", "Turiu čekį", "Ne", "Pakeisti prekę"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Parengti pretenziją" }).click();
    await page.getByLabel("Vienas prašymas").selectOption("REPAIR");
    await page.getByLabel("Vardas ir pavardė").fill("Jūratė Ąžuolaitė");
    await page.getByLabel("El. paštas").fill("jurate@example.test");
    await page.getByLabel("Prekės trūkumo aprašymas").fill("Lempa nebeįsijungia įprastai naudojant.");
    await expect(page.getByRole("heading", { name: "Dokumento peržiūra" })).toBeVisible();
    await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}/complaints/[0-9a-f-]+$`));
    const savedDefectPath = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Atsijungti" }).click();
    await expect(page).toHaveURL("/");
    await page.goto(savedDefectPath);
    await expect(page).toHaveURL(/\/login\?next=/);
    const form = page.getByRole("heading", { name: "Prisijungti" }).locator("..");
    await form.getByLabel("El. paštas").fill(credentials.a.email);
    await form.getByLabel("Slaptažodis").fill(credentials.a.password);
    await form.getByRole("button", { name: "Prisijungti" }).click();
    await expect(page).toHaveURL(savedDefectPath);
    let releaseSave!: () => void;
    const heldSave = new Promise<void>((resolve) => { releaseSave = resolve; });
    const complaintApi = `/api/purchases/${purchaseId}/complaints`;
    await page.route(complaintApi, async (route) => { const response = await route.fetch(); await heldSave; await route.fulfill({ response }); });
    await page.getByLabel("Vardas ir pavardė").fill("Jūratė Nauja");
    await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
    await expect(page.getByLabel("Vardas ir pavardė")).toBeDisabled();
    await expect(page.getByLabel("Prekės trūkumo aprašymas")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" })).toBeDisabled();
    releaseSave();
    await expect(page.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" })).toBeEnabled();
    await page.unroute(complaintApi);
    const confirmedPreview = await page.getByRole("heading", { name: "Dokumento peržiūra" }).locator("..").locator("pre").textContent();
    await page.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).click();
    await expect(page.getByText("Versija 1", { exact: false })).toBeVisible();
    const savedDefect = (await client.from("complaints").select("id").eq("purchase_id", purchaseId).eq("family", "DEFECTIVE_PRODUCT").single()).data!;
    const savedVersion = (await client.from("complaint_versions").select("plain_text").eq("complaint_id", savedDefect.id).single()).data!;
    expect(savedVersion.plain_text.trim()).toBe(confirmedPreview?.trim());
    const savedVersionId = (await client.from("complaint_versions").select("id").eq("complaint_id", savedDefect.id).single()).data!.id;
    const exportBase = `/api/purchases/${purchaseId}/complaints/${savedDefect.id}/versions/${savedVersionId}`;
    const textExport = await page.request.get(`${exportBase}?format=txt`);
    expect(textExport.status()).toBe(200);
    expect(await textExport.text()).toContain("Jūratė Nauja");
    const pdfExport = await page.request.get(`${exportBase}?format=pdf`);
    expect(pdfExport.status()).toBe(200);
    expect((await pdfExport.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
    await page.getByRole("button", { name: "Kopijuoti tekstą" }).first().click();
    await expect(page.getByText("Nepavyko nukopijuoti. Pažymėkite tekstą žemiau ir nukopijuokite patys.")).toBeVisible();
    expect((await client.from("purchases").update({ notes: "Patikslinta pastaba" }).eq("id", purchaseId)).error).toBeNull();
    await page.goto(savedDefectPath);
    await page.getByRole("button", { name: "Pakartoti teisinę patikrą" }).click();
    for (const label of ["Aš kaip privatus asmuo", "Parduotuvės / įmonės", "Fizinė prekė", "Nauja"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByLabel("Data", { exact: true }).fill(receivedDate);
    await page.getByRole("button", { name: "Toliau" }).click();
    await page.getByLabel("Data", { exact: true }).fill(localDate(2));
    await page.getByRole("button", { name: "Toliau" }).click();
    for (const label of ["Prekė sugedo arba trūkumas atsirado įprastai naudojant", "Turiu čekį", "Ne", "Pakeisti prekę"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Parengti pretenziją" }).click();
    await page.getByLabel("Vienas prašymas").selectOption("REPAIR");
    await expect(page.getByLabel("Vardas ir pavardė")).toHaveValue("Jūratė Nauja");
    await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
    await expect(page.getByText("Juodraštis išsaugotas.")).toBeVisible();
    await page.getByRole("button", { name: "Parengti naują versiją" }).click();
    await expect(page.getByText("Versija 2", { exact: false })).toBeVisible();
    expect((await client.from("complaint_versions").select("plain_text").eq("complaint_id", savedDefect.id).eq("version_no", 1).single()).data?.plain_text).toBe(savedVersion.plain_text);

    await page.goto(`/purchases/${purchaseId}/complaints/new?flow=return`);
    for (const label of ["Ne", "Aš kaip privatus asmuo", "Parduotuvės / įmonės"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: /^Internetu/ }).click();
    await page.getByLabel("Data").fill(receivedDate);
    await page.getByRole("button", { name: "Toliau" }).click();
    for (const label of ["Ne", "Ne", "Ne", "Ne, nė viena netinka", "Tik apžiūrėjau ar išbandžiau"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Parengti sutarties atsisakymą" }).click();
    await page.getByLabel("Vienas prašymas").selectOption("WITHDRAW");
    await page.getByLabel("Vardas ir pavardė").fill("Jūratė Ąžuolaitė");
    await page.getByLabel("El. paštas").fill("jurate@example.test");
    await expect(page.getByText("Pranešu, kad atsisakau nuotoliniu būdu", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}/complaints/[0-9a-f-]+$`));
    await page.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).click();
    await expect(page.getByText("Versija 1", { exact: false })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto(`/purchases/${purchaseId}`);
    await expect(page.getByRole("heading", { name: "Dokumentai pardavėjui" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sutarties atsisakymas" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await client.from("purchases").delete().eq("id", purchaseId);
    await client.auth.signOut();
  }
});

test("physical store assessment produces a reviewed exchange request", async ({ page }) => {
  test.setTimeout(90_000);
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  expect(credentials.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const client = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword(credentials.a)).error).toBeNull();
  const purchaseId = randomUUID();
  const purchaseDate = localDate(3);
  try {
    expect((await client.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id, product_name: "Bandomieji batai", seller_name: "Bandymų parduotuvė", purchase_date: purchaseDate, purchase_channel: "PHYSICAL_STORE" })).error).toBeNull();
    await login(page, credentials.a);
    await page.goto(`/purchases/${purchaseId}/complaints/new?flow=return`);
    for (const label of ["Ne", "Aš kaip privatus asmuo", "Parduotuvės / įmonės"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: /^Fizinėje parduotuvėje/ }).click();
    await page.getByLabel("Data").fill(purchaseDate);
    await page.getByRole("button", { name: "Toliau" }).click();
    for (const label of ["Drabužiai / avalynė", "Suaugusiųjų viršutiniai drabužiai arba avalynė", "Ne", "Taip", "Turiu čekį"]) await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Parengti pretenziją" }).click();
    await page.getByLabel("Vienas prašymas").selectOption("EXCHANGE");
    await page.getByLabel("Kodėl norite pakeisti prekę?").selectOption("SIZE");
    await page.getByLabel("Vardas ir pavardė").fill("Jūratė Ąžuolaitė");
    await page.getByLabel("El. paštas").fill("jurate@example.test");
    await expect(page.getByText("Prekė manęs netenkina dėl šios savybės: dydis.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}/complaints/[0-9a-f-]+$`));
    await page.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).click();
    await expect(page.getByText("Versija 1", { exact: false })).toBeVisible();
  } finally {
    await client.from("purchases").delete().eq("id", purchaseId);
    await client.auth.signOut();
  }
});
