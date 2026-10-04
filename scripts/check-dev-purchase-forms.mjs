import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE, "utf8"));
assert.match(credentials.url, /^http:\/\/127\.0\.0\.1:\d+$/);
const base = "http://127.0.0.1:3102";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3102"], {
  env: { ...process.env, NEXT_DIST_DIR: ".next-dev-sprint04" }, stdio: "ignore"
});
const client = createClient(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
let browser;
let purchaseId;
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw new Error("Development server stopped before becoming ready");
    try { ready = (await fetch(`${base}/login`)).ok; } catch { /* Still starting. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Development server did not become ready");
  assert.equal((await client.auth.signInWithPassword(credentials.a)).error, null);
  const product = `Dev form ${randomUUID()}`;
  const purchaseDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const receivedDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const created = await client.from("purchases").insert({ user_id: credentials.a.id, product_name: product,
    seller_name: "Bandymų parduotuvė", purchase_date: purchaseDate, received_date: receivedDate,
    purchase_channel: "DISTANCE" }).select("*").single();
  assert.equal(created.error, null);
  purchaseId = created.data.id;
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/login`);
  const form = page.getByRole("heading", { name: "Prisijungti" }).locator("..");
  await form.getByLabel("El. paštas").fill(credentials.a.email);
  await form.getByLabel("Slaptažodis").fill(credentials.a.password);
  await form.getByRole("button", { name: "Prisijungti" }).click();
  await page.getByRole("heading", { name: "Mano pirkiniai" }).waitFor();
  await page.goto(`${base}/purchases/new`);
  await page.getByRole("heading", { name: "Pridėti pirkinį" }).waitFor();
  await page.getByLabel("Ką pirkote?").waitFor();
  await page.goto(`${base}/purchases/${purchaseId}/edit`);
  await page.getByRole("heading", { name: "Redaguoti pirkinį" }).waitFor();
  assert.equal(await page.getByLabel("Ką pirkote?").inputValue(), product);
  await page.getByLabel("Ką pirkote?").fill(`${product} patikra`);
  await page.goto(`${base}/purchases/${purchaseId}/complaints/new?flow=defect`);
  await page.getByRole("heading", { name: "Naujas dokumentas pardavėjui" }).waitFor();
  const complaintId = randomUUID();
  const draft = await client.from("complaints").insert({ id: complaintId, user_id: credentials.a.id, purchase_id: purchaseId,
    family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers: { buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW", purchasedAt: purchaseDate, deliveredAt: receivedDate, apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO", asOfDate: new Date().toISOString().slice(0, 10) },
    facts: { consumerName: "Jūratė Bandymų", consumerEmail: "jurate@example.test", sellerName: "Bandymų parduotuvė", sellerContact: "", productName: product, purchaseDate, receivedDate, purchaseChannel: "DISTANCE", referenceNumber: "", priceCents: null, documentDate: new Date().toISOString().slice(0, 10), defectDescription: "Bandymo metu pastebėtas prekės trūkumas.", defectDiscoveredAt: null, reductionCents: null, reductionExplanation: "", physicalReason: null, confirmedNotMinor: false, alternativeProof: "", evidenceIds: [] },
    remedy: "REPAIR", purchase_updated_at: created.data.updated_at, template_version: "dev-test", source_version: "dev-test" }).select("id").single();
  assert.equal(draft.error, null);
  await page.waitForTimeout(500);
  const beforeDraftLength = await page.evaluate(() => history.length);
  await page.goto(`${base}/purchases/${purchaseId}/complaints/${complaintId}`);
  await page.getByRole("heading", { name: "Dokumentas pardavėjui" }).waitFor();
  assert.equal(await page.getByLabel("Vardas ir pavardė").inputValue(), "Jūratė Bandymų");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => history.length), beforeDraftLength + 2, "StrictMode must install one complaint guard");
  assert.deepEqual(errors, []);
  process.stdout.write("Authenticated development purchase and complaint forms passed.\n");
} finally {
  if (purchaseId) await client.from("purchases").delete().eq("id", purchaseId);
  await client.auth.signOut();
  await browser?.close();
  server.kill("SIGTERM");
}
