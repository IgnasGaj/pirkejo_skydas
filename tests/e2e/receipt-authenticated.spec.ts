import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";

const enabled = process.env.E2E_AUTH_LOCAL === "1" && Boolean(process.env.E2E_AUTH_CREDENTIALS_FILE);
test.skip(!enabled, "Requires disposable local Supabase and credentials outside Git");
type User = { id: string; email: string; password: string };
type Credentials = { url: string; key: string; a: User; b: User };
const date = (() => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() - 3 * 86_400_000));
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
})();

async function login(page: Page, user: User, navigate = true) {
  if (navigate) await page.goto("/login");
  const form = page.getByRole("heading", { name: "Prisijungti" }).locator("..");
  await form.getByLabel("El. paštas").fill(user.email);
  await form.getByLabel("Slaptažodis").fill(user.password);
  await form.getByRole("button", { name: "Prisijungti" }).click();
  if (navigate) await expect(page).toHaveURL(/\/purchases(?:\?|$)/);
}

test("database claim serializes overlapping receipt saves and preserves bytes", async () => {
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const a = createClient<Database>(credentials.url, credentials.key, options);
  const retry = createClient<Database>(credentials.url, credentials.key, options);
  expect((await a.auth.signInWithPassword(credentials.a)).error).toBeNull();
  expect((await retry.auth.signInWithPassword(credentials.a)).error).toBeNull();
  const purchaseId = randomUUID();
  const documentId = randomUUID();
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9w3ZkAAAAASUVORK5CYII=", "base64");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const path = `${credentials.a.id}/${purchaseId}/${documentId}.png`;
  const args = { p_purchase_id: purchaseId, p_document_id: documentId, p_path: path,
    p_filename: "race.png", p_mime: "image/png", p_size: buffer.length, p_sha256: sha256 };
  try {
    expect((await a.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id,
      product_name: "Lygiagretus čekis", seller_name: "Bandymų parduotuvė", purchase_date: date,
      purchase_channel: "UNKNOWN" })).error).toBeNull();
    expect((await a.rpc("claim_reviewed_receipt", { ...args, p_token: tokenA })).data).toBe("CLAIMED");
    expect((await retry.rpc("claim_reviewed_receipt", { ...args, p_token: tokenB })).data).toBe("PENDING");
    expect((await a.storage.from("purchase-evidence").upload(path, buffer, { contentType: "image/png", upsert: false })).error).toBeNull();
    expect((await retry.rpc("claim_reviewed_receipt", { ...args, p_token: tokenB })).data).toBe("PENDING");
    const completed = await a.from("purchase_documents").update({ upload_state: "READY", upload_claim_token: null,
      upload_claim_expires_at: null }).eq("id", documentId).eq("upload_claim_token", tokenA).select("id");
    expect(completed.error).toBeNull(); expect(completed.data).toHaveLength(1);
    expect((await retry.rpc("claim_reviewed_receipt", { ...args, p_token: tokenB })).data).toBe("READY");
    const saved = await retry.storage.from("purchase-evidence").download(path);
    expect(saved.error).toBeNull();
    expect(createHash("sha256").update(Buffer.from(await saved.data!.arrayBuffer())).digest("hex")).toBe(sha256);
    expect((await retry.from("purchase_documents").select("id,upload_state").eq("id", documentId)).data)
      .toEqual([{ id: documentId, upload_state: "READY" }]);
  } finally {
    await a.storage.from("purchase-evidence").remove([path]);
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut(); await retry.auth.signOut();
  }
});

test("cancelling a real worker scan leaves manual entry usable", async ({ page }) => {
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  await login(page, credentials.a);
  await page.goto("/purchases/new");
  await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9w3ZkAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Pasirinkite čekį").setInputFiles({ name: "cancel.png", mimeType: "image/png", buffer: png });
  const cancelled = await page.evaluate(async () => {
    const button = (name: string) => [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === name);
    button("Nuskaityti")?.click();
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const cancel = button("Atšaukti");
      if (cancel) { cancel.click(); return true; }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return false;
  });
  expect(cancelled).toBe(true);
  await expect(page.getByText("Nuskaitymas atšauktas.", { exact: false })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("Nuskaitytus duomenis patikrinkite prieš išsaugodami.")).toHaveCount(0);
  await page.getByRole("button", { name: "Įvesti ranka" }).click();
  await expect(page.getByLabel("Ką pirkote?")).toBeVisible();
});

test("scan assisted save and selected existing-receipt corrections", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  expect(credentials.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const client = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword(credentials.a)).error).toBeNull();
  let purchaseId = "";
  let documentPath = "";
  let largePath = "";
  try {
    await login(page, credentials.a);
    await page.goto("/purchases/new");
    await expect(page.getByRole("heading", { name: "Pridėti pirkinį" })).toBeVisible();
    await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
    const dataUrl = await page.evaluate((receiptDate) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1500; canvas.height = 650;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "black"; context.font = "bold 72px Arial";
      ["PARDUOTUVE", `CEKIS NR R12345`, receiptDate, "KAVA 12,50", "TOTAL 12,50 EUR"].forEach((line, index) => context.fillText(line, 60, 110 + index * 115));
      return canvas.toDataURL("image/png");
    }, date);
    const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
    await page.getByLabel("Pasirinkite čekį").setInputFiles({ name: "synthetic-receipt.png", mimeType: "image/png", buffer });
    await expect(page.getByAltText("Pasirinkto čekio peržiūra")).toBeVisible();
    await page.getByRole("button", { name: "Nuskaityti", exact: true }).click();
    await expect(page.getByText("Nuskaitytus duomenis patikrinkite prieš išsaugodami.")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Bendra čekio suma:")).toContainText("12.50 EUR");
    await expect(page.locator("details pre")).toContainText("KAVA");
    if (process.env.E2E_CAPTURE_REVIEW === "1") await page.screenshot({ path: "/tmp/sprint04-desktop-review.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    if (process.env.E2E_CAPTURE_REVIEW === "1") await page.screenshot({ path: "/tmp/sprint04-mobile-review.png", fullPage: true });
    await page.getByLabel("Ką pirkote?").fill(`Kava ${randomUUID()}`);
    await page.getByLabel("Pardavėjas").fill("Parduotuvė");
    await page.getByLabel("Kada pirkote?").fill(date);
    await expect(page.getByLabel("Kaip pirkote?")).toHaveValue("UNKNOWN");
    await page.getByRole("button", { name: "Išsaugoti pirkinį ir čekį" }).click();
    await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}\?state=created$/, { timeout: 30_000 });
    purchaseId = new URL(page.url()).pathname.split("/").at(-1)!;
    const { data: documents, error } = await client.from("purchase_documents").select("*").eq("purchase_id", purchaseId);
    expect(error).toBeNull(); expect(documents).toHaveLength(1);
    const savedDocument = documents![0];
    documentPath = savedDocument.storage_path;
    const hash = createHash("sha256").update(buffer).digest("hex");
    const saved = await client.storage.from("purchase-evidence").download(documentPath);
    expect(saved.error).toBeNull();
    expect(createHash("sha256").update(Buffer.from(await saved.data!.arrayBuffer())).digest("hex")).toBe(hash);
    const privateImage = `/api/purchases/${purchaseId}/documents/${savedDocument.id}/image`;
    const ownResponse = await page.request.get(privateImage);
    expect(ownResponse.status()).toBe(200);
    expect(ownResponse.headers()["cache-control"]).toContain("no-store");
    expect((await page.request.get(`/api/purchases/${randomUUID()}/documents/${savedDocument.id}/image`)).status()).toBe(404);
    const anonymous = await browser.newContext();
    try { expect((await anonymous.request.get(`http://127.0.0.1:3100${privateImage}`)).status()).toBe(404); }
    finally { await anonymous.close(); }
    const b = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await b.auth.signInWithPassword(credentials.b)).error).toBeNull();
    expect((await b.storage.from("purchase-evidence").download(documentPath)).error).not.toBeNull();
    const bContext = await browser.newContext();
    try {
      const bPage = await bContext.newPage();
      await login(bPage, credentials.b);
      expect((await bPage.request.get(privateImage)).status()).toBe(404);
    } finally { await bContext.close(); await b.auth.signOut(); }
    expect((await page.request.get(privateImage)).status()).toBe(200);
    await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
    await page.getByRole("button", { name: "Nuskaityti", exact: true }).click({ timeout: 10_000 });
    await expect(page.getByText("Pažymėkite tik norimus pakeitimus.", { exact: false })).toBeVisible({ timeout: 90_000 });
    await page.getByLabel("Siūloma: Pardavėjas").fill("Patikslinta parduotuvė");
    await page.getByLabel("Pritaikyti šį pakeitimą").nth(1).check();
    await client.from("purchases").update({ notes: "Pakeista kitur" }).eq("id", purchaseId);
    await page.getByRole("button", { name: "Pritaikyti pasirinktus pakeitimus" }).click();
    await expect(page.getByText("Pirkinys buvo pakeistas kitur", { exact: false })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
    await page.getByRole("button", { name: "Nuskaityti", exact: true }).click();
    await expect(page.getByLabel("Siūloma: Pardavėjas")).toBeVisible({ timeout: 90_000 });
    await page.getByLabel("Siūloma: Pardavėjas").fill("Patikslinta parduotuvė");
    await page.getByLabel("Pritaikyti šį pakeitimą").nth(1).check();
    await page.getByRole("button", { name: "Pritaikyti pasirinktus pakeitimus" }).click();
    await expect(page.getByText("Patikslinta parduotuvė")).toBeVisible();
    const { data: updated } = await client.from("purchases").select("seller_name,notes,purchase_channel").eq("id", purchaseId).single();
    expect(updated).toMatchObject({ seller_name: "Patikslinta parduotuvė", notes: "Pakeista kitur", purchase_channel: "UNKNOWN" });
    const after = await client.storage.from("purchase-evidence").download(documentPath);
    expect(createHash("sha256").update(Buffer.from(await after.data!.arrayBuffer())).digest("hex")).toBe(hash);
    expect((await client.from("purchase_documents").select("id").eq("purchase_id", purchaseId)).data).toHaveLength(1);
    const nearLimit = Buffer.alloc(15 * 1024 * 1024 - 1024);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(nearLimit);
    await page.getByLabel("Dokumento tipas").selectOption("OTHER");
    await page.getByLabel("Failas").setInputFiles({ name: "near-limit.png", mimeType: "image/png", buffer: nearLimit });
    await page.getByRole("button", { name: "Įkelti failą" }).click();
    await expect(page.getByRole("status")).toContainText("Failas išsaugotas", { timeout: 30_000 });
    const { data: largeDocument } = await client.from("purchase_documents").select("id,storage_path").eq("purchase_id", purchaseId).eq("original_filename", "near-limit.png").single();
    expect(largeDocument).not.toBeNull();
    largePath = largeDocument!.storage_path;
    await client.storage.from("purchase-evidence").remove([largeDocument!.storage_path]);
    await client.from("purchase_documents").delete().eq("id", largeDocument!.id);
    largePath = "";
    await page.reload();
    await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
    await page.getByRole("button", { name: "Nuskaityti", exact: true }).click();
    await expect(page.getByLabel("Siūloma: Pardavėjas")).toBeVisible({ timeout: 90_000 });
    await page.getByLabel("Siūloma: Pardavėjas").fill("Nebegaliojantis pasiūlymas");
    await page.getByLabel("Pritaikyti šį pakeitimą").nth(1).check();
    expect((await client.from("purchase_documents").delete().eq("id", savedDocument.id).select("id")).data).toHaveLength(1);
    await page.getByRole("button", { name: "Pritaikyti pasirinktus pakeitimus" }).click();
    await expect(page.getByText("Čekis nepasiekiamas.", { exact: false })).toBeVisible();
    expect((await client.from("purchases").select("seller_name").eq("id", purchaseId).single()).data?.seller_name).toBe("Patikslinta parduotuvė");
  } finally {
    if (largePath) await client.storage.from("purchase-evidence").remove([largePath]);
    if (documentPath) await client.storage.from("purchase-evidence").remove([documentPath]);
    if (purchaseId) await client.from("purchases").delete().eq("id", purchaseId);
    await client.auth.signOut();
  }
});

test("PDF scan fallback still saves private evidence with manual values", async ({ page }) => {
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  const client = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword(credentials.a)).error).toBeNull();
  let purchaseId = "";
  let path = "";
  try {
    await login(page, credentials.a);
    await page.goto("/purchases/new");
    await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
    await page.getByLabel("Pasirinkite čekį").setInputFiles({ name: "synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nsynthetic test proof\n%%EOF") });
    await expect(page.getByText("Šį failą galite išsaugoti kaip pirkimo įrodymą.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuskaityti", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Įvesti ranka" }).click();
    await expect(page.getByText("Pasirinktas čekis", { exact: false })).toContainText("synthetic.pdf");
    await page.getByLabel("Ką pirkote?").fill(`Rankinis ${randomUUID()}`);
    await page.getByLabel("Pardavėjas").fill("Bandymų parduotuvė");
    await page.getByLabel("Kada pirkote?").fill(date);
    await page.getByRole("button", { name: "Išsaugoti pirkinį ir čekį" }).click();
    await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}\?state=created$/);
    purchaseId = new URL(page.url()).pathname.split("/").at(-1)!;
    const { data } = await client.from("purchase_documents").select("storage_path,mime_type").eq("purchase_id", purchaseId).single();
    expect(data?.mime_type).toBe("application/pdf");
    path = data?.storage_path ?? "";
  } finally {
    if (path) await client.storage.from("purchase-evidence").remove([path]);
    if (purchaseId) await client.from("purchases").delete().eq("id", purchaseId);
    await client.auth.signOut();
  }
});

test("an actual upload conflict gives partial success and retries on the same purchase", async ({ page }) => {
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  const client = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword(credentials.a)).error).toBeNull();
  let purchaseId = "";
  let path = "";
  try {
    await login(page, credentials.a);
    await page.goto("/purchases/new");
    await expect(page).toHaveURL(/draft=[0-9a-f-]{36}&document=[0-9a-f-]{36}/);
    const draftUrl = page.url();
    purchaseId = new URL(draftUrl).searchParams.get("draft")!;
    const documentId = new URL(draftUrl).searchParams.get("document")!;
    const created = await client.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id,
      product_name: "Išsaugotas bandymas", seller_name: "Bandymų parduotuvė", purchase_date: date, purchase_channel: "UNKNOWN" });
    expect(created.error).toBeNull();
    await page.reload();
    await expect(page.getByRole("link", { name: "Atidaryti pirkinį" })).toHaveAttribute("href", `/purchases/${purchaseId}`);
    await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9w3ZkAAAAASUVORK5CYII=", "base64");
    path = `${credentials.a.id}/${purchaseId}/${documentId}.png`;
    expect((await client.storage.from("purchase-evidence").upload(path, Buffer.from("conflicting object"),
      { contentType: "image/png", upsert: false })).error).toBeNull();
    await page.getByLabel("Pasirinkite čekį").setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Pakartoti čekio įkėlimą" }).click();
    await expect(page.getByText("Pirkinys išsaugotas, tačiau čekio įkelti nepavyko.")).toBeVisible();
    expect((await client.from("purchase_documents").select("upload_state").eq("id", documentId).single()).data?.upload_state).toBe("PENDING");
    expect((await client.storage.from("purchase-evidence").remove([path])).error).toBeNull();
    await page.context().clearCookies();
    await page.getByRole("button", { name: "Pakartoti čekio įkėlimą" }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(`/purchases/new?draft=${purchaseId}&document=${documentId}`);
    await login(page, credentials.a, false);
    await expect(page).toHaveURL(draftUrl);
    await expect(page.getByText("pasirinkite originalų čekio failą iš naujo", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Nuskaityti čekį" }).click();
    await page.getByLabel("Pasirinkite čekį").setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Pakartoti čekio įkėlimą" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}\\?state=created$`));
    const { data: purchases } = await client.from("purchases").select("id").eq("id", purchaseId);
    expect(purchases).toHaveLength(1);
    const { data: documents } = await client.from("purchase_documents").select("id,storage_path").eq("purchase_id", purchaseId);
    expect(documents).toHaveLength(1);
    expect(documents![0].storage_path).toBe(path);
    const saved = await client.storage.from("purchase-evidence").download(path);
    expect(saved.error).toBeNull();
    expect(createHash("sha256").update(Buffer.from(await saved.data!.arrayBuffer())).digest("hex"))
      .toBe(createHash("sha256").update(png).digest("hex"));
    await page.goto(draftUrl);
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}\\?state=created$`));
  } finally {
    if (path) await client.storage.from("purchase-evidence").remove([path]);
    if (purchaseId) await client.from("purchases").delete().eq("id", purchaseId);
    await client.auth.signOut();
  }
});
