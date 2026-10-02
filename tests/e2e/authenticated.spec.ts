import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";

const enabled = process.env.E2E_AUTH_LOCAL === "1" && Boolean(process.env.E2E_AUTH_CREDENTIALS_FILE);
test.skip(!enabled, "Requires disposable local Supabase and credentials outside Git");

type TestUser = { email: string; password: string; id: string };
type Credentials = { url: string; key: string; a: TestUser; b: TestUser };
const bucket = "purchase-evidence";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9w3ZkAAAAASUVORK5CYII=", "base64");

function localDate(daysAgo: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(Date.now() - daysAgo * 86_400_000));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function login(page: Page, user: TestUser) {
  const form = page.getByRole("heading", { name: "Prisijungti" }).locator("..");
  await form.getByLabel("El. paštas").fill(user.email);
  await form.getByLabel("Slaptažodis").fill(user.password);
  await form.getByRole("button", { name: "Prisijungti" }).click();
}

test("two-account RLS and authenticated purchase lifecycle", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  expect(credentials.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const a = createClient<Database>(credentials.url, credentials.key, options);
  const b = createClient<Database>(credentials.url, credentials.key, options);
  const anon = createClient<Database>(credentials.url, credentials.key, options);
  expect((await a.auth.signInWithPassword(credentials.a)).error).toBeNull();
  expect((await b.auth.signInWithPassword(credentials.b)).error).toBeNull();
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  let purchaseId: string | undefined;
  let documentPath: string | undefined;
  let bPurchaseId: string | undefined;
  let bDocumentPath: string | undefined;

  try {
    await page.goto("/purchases/new");
    await expect(page).toHaveURL(/\/login\?next=/);
    await login(page, credentials.a);
    await expect(page).toHaveURL(/\/purchases\/new\?draft=[0-9a-f-]{36}&document=[0-9a-f-]{36}$/);
    const product = `Sprint 03.1 test ${randomUUID()}`;
    await page.getByLabel("Ką pirkote?").fill(product);
    await page.getByLabel("Pardavėjas").fill("Bandymų parduotuvė");
    await page.getByLabel("Kada pirkote?").fill(localDate(3));
    await page.getByRole("button", { name: "Išsaugoti pirkinį" }).click();
    await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}\?state=created$/);
    purchaseId = new URL(page.url()).pathname.split("/").at(-1)!;

    const ownPurchase = await a.from("purchases").select("*").eq("id", purchaseId).single();
    expect(ownPurchase.error).toBeNull();
    expect(ownPurchase.data?.user_id).toBe(credentials.a.id);

    await page.getByLabel("Failas").setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Įkelti failą" }).click();
    await expect(page.getByRole("status")).toContainText("Failas išsaugotas");
    const ownDocument = await a.from("purchase_documents").select("*").eq("purchase_id", purchaseId).single();
    expect(ownDocument.error).toBeNull();
    const document = ownDocument.data!;
    documentPath = document.storage_path;
    expect(document.user_id).toBe(credentials.a.id);
    expect((await a.storage.from(bucket).download(documentPath)).error).toBeNull();

    const bOwn = await b.from("purchases").insert({
      user_id: credentials.b.id, product_name: `Sprint 03.1 B test ${randomUUID()}`,
      seller_name: "Bandymų parduotuvė", purchase_date: localDate(2), purchase_channel: "PHYSICAL_STORE"
    }).select("id").single();
    expect(bOwn.error).toBeNull();
    bPurchaseId = bOwn.data!.id;
    bDocumentPath = `${credentials.b.id}/${bPurchaseId}/${randomUUID()}.png`;
    expect((await b.storage.from(bucket).upload(bDocumentPath, png, { contentType: "image/png", upsert: false })).error).toBeNull();
    const bOwnDocument = await b.from("purchase_documents").insert({
      user_id: credentials.b.id, purchase_id: bPurchaseId, document_type: "RECEIPT",
      original_filename: "b-proof.png", storage_path: bDocumentPath, mime_type: "image/png", size_bytes: png.length
    }).select("id").single();
    expect(bOwnDocument.error).toBeNull();
    expect((await b.from("purchases").select("id").eq("id", bPurchaseId).single()).data?.id).toBe(bPurchaseId);
    expect((await b.from("purchase_documents").update({ document_type: "OTHER" }).eq("id", bOwnDocument.data!.id).select("id").single()).error).toBeNull();
    expect((await b.storage.from(bucket).download(bDocumentPath)).error).toBeNull();
    expect((await b.storage.from(bucket).remove([bDocumentPath])).error).toBeNull();
    expect((await b.from("purchase_documents").delete().eq("id", bOwnDocument.data!.id).select("id").single()).error).toBeNull();
    bDocumentPath = undefined;
    expect((await b.from("purchases").delete().eq("id", bPurchaseId).select("id").single()).error).toBeNull();
    bPurchaseId = undefined;

    const accessPath = `/api/purchases/${purchaseId}/documents/${document.id}/access`;
    const ownAccess = await page.request.get(accessPath, { maxRedirects: 0 });
    expect(ownAccess.status()).toBeGreaterThanOrEqual(300);
    expect(ownAccess.status()).toBeLessThan(400);
    expect(ownAccess.headers().location).toContain("/storage/v1/object/sign/");
    const popupPromise = page.context().waitForEvent("page");
    await page.getByRole("link", { name: "Peržiūrėti" }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/storage\/v1\/object\/sign\//);
    await popup.close();

    const updatedDocument = await a.from("purchase_documents").update({ document_type: "INVOICE" }).eq("id", document.id).select("id").single();
    expect(updatedDocument.error).toBeNull();
    expect(updatedDocument.data?.id).toBe(document.id);

    expect((await b.from("purchases").select("id").eq("id", purchaseId)).data).toEqual([]);
    expect((await b.from("purchase_documents").select("id").eq("id", document.id)).data).toEqual([]);
    expect((await b.from("purchases").update({ notes: "unauthorized" }).eq("id", purchaseId).select("id")).data).toEqual([]);
    expect((await b.from("purchases").delete().eq("id", purchaseId).select("id")).data).toEqual([]);
    expect((await b.from("purchase_documents").update({ document_type: "OTHER" }).eq("id", document.id).select("id")).data).toEqual([]);
    expect((await b.from("purchase_documents").delete().eq("id", document.id).select("id")).data).toEqual([]);
    const crossInsert = await b.from("purchase_documents").insert({
      user_id: credentials.b.id, purchase_id: purchaseId, document_type: "RECEIPT",
      original_filename: "cross.png", storage_path: `${credentials.b.id}/${purchaseId}/${randomUUID()}.png`,
      mime_type: "image/png", size_bytes: png.length
    });
    expect(crossInsert.error).not.toBeNull();
    expect((await b.storage.from(bucket).download(documentPath)).error).not.toBeNull();
    expect((await b.storage.from(bucket).createSignedUrl(documentPath, 60)).error).not.toBeNull();
    expect((await b.storage.from(bucket).upload(documentPath, png, { contentType: "image/png", upsert: false })).error).not.toBeNull();
    const bDeleteStorage = await b.storage.from(bucket).remove([documentPath]);
    expect(Boolean(bDeleteStorage.error) || bDeleteStorage.data?.length === 0).toBe(true);

    expect((await anon.from("purchases").select("id").eq("id", purchaseId)).data).toEqual([]);
    expect((await anon.from("purchase_documents").select("id").eq("id", document.id)).data).toEqual([]);
    expect((await anon.storage.from(bucket).download(documentPath)).error).not.toBeNull();
    expect((await anon.storage.from(bucket).upload(documentPath, png, { contentType: "image/png", upsert: false })).error).not.toBeNull();
    const anonDeleteStorage = await anon.storage.from(bucket).remove([documentPath]);
    expect(Boolean(anonDeleteStorage.error) || anonDeleteStorage.data?.length === 0).toBe(true);
    expect((await a.from("purchases").select("notes").eq("id", purchaseId).single()).data?.notes).not.toBe("unauthorized");
    expect((await a.from("purchase_documents").select("document_type").eq("id", document.id).single()).data?.document_type).toBe("INVOICE");
    expect((await a.storage.from(bucket).download(documentPath)).error).toBeNull();

    const bContext = await browser.newContext();
    try {
      const bPage = await bContext.newPage();
      await bPage.goto("/login");
      await login(bPage, credentials.b);
      const bAccess = await bPage.request.get(accessPath, { maxRedirects: 0 });
      expect(bAccess.status()).toBe(404);
      expect(bAccess.headers().location).toBeUndefined();
    } finally {
      await bContext.close();
    }
    const anonAccess = await anon.auth.getUser();
    expect(anonAccess.data.user).toBeNull();
    const routeAnon = await browser.newContext();
    try {
      const response = await routeAnon.request.get(`http://127.0.0.1:3100${accessPath}`, { maxRedirects: 0 });
      expect(response.status()).toBe(404);
    } finally {
      await routeAnon.close();
    }

    await page.getByRole("link", { name: "Redaguoti" }).click();
    await page.getByLabel("Pastabos").fill("Atnaujinta per bandymą");
    await page.getByRole("button", { name: "Išsaugoti pakeitimus" }).click();
    await expect(page.getByText("Atnaujinta per bandymą")).toBeVisible();
    await page.getByRole("link", { name: "Ar galiu grąžinti?" }).click();
    await expect(page.getByRole("heading", { name: "Ar prekė yra sugedusi arba nekokybiška?" })).toBeVisible();
    await page.goto(`/purchases/${purchaseId}`);
    await page.getByRole("button", { name: "Atsijungti" }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/");
    await page.goto(`/purchases/${purchaseId}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await login(page, credentials.a);
    await expect(page.getByText(product)).toBeVisible();
    await expect(page.getByText("Atnaujinta per bandymą")).toBeVisible();
    await expect(page.getByText("proof.png")).toBeVisible();

    const removeEvidence = page.getByRole("button", { name: "Pašalinti", exact: true });
    await removeEvidence.click();
    const dialog = page.getByRole("dialog", { name: "Pašalinti failą?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Atšaukti" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(removeEvidence).toBeFocused();
    await removeEvidence.click();
    await dialog.getByRole("button", { name: "Ištrinti" }).click();
    await expect(page.getByRole("status")).toContainText("Failas pašalintas");
    expect((await a.from("purchase_documents").select("id").eq("id", document.id)).data).toEqual([]);
    expect((await a.storage.from(bucket).download(documentPath)).error).not.toBeNull();
    documentPath = undefined;

    await page.getByRole("button", { name: "Ištrinti pirkinį" }).click();
    await page.getByRole("dialog", { name: "Ištrinti pirkinį?" }).getByRole("button", { name: "Ištrinti" }).click();
    await expect(page).toHaveURL(/\/purchases\?state=deleted$/);
    expect((await a.from("purchases").select("id").eq("id", purchaseId)).data).toEqual([]);
    purchaseId = undefined;
    expect(browserErrors).toEqual([]);
  } finally {
    if (documentPath) await a.storage.from(bucket).remove([documentPath]);
    if (purchaseId) await a.from("purchases").delete().eq("id", purchaseId);
    if (bDocumentPath) await b.storage.from(bucket).remove([bDocumentPath]);
    if (bPurchaseId) await b.from("purchases").delete().eq("id", bPurchaseId);
    await a.auth.signOut();
    await b.auth.signOut();
  }
});

test("stale purchase edit keeps newer seller, date, and price", async ({ page, context }) => {
  const credentials = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as Credentials;
  const client = createClient<Database>(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword(credentials.a)).error).toBeNull();
  const purchaseId = randomUUID();
  const originalDate = localDate(4);
  const newerDate = localDate(3);
  try {
    expect((await client.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id,
      product_name: "Dviejų langų pirkinys", seller_name: "Senas pardavėjas", purchase_date: originalDate,
      purchase_channel: "PHYSICAL_STORE", price_cents: 1000 })).error).toBeNull();
    await page.goto("/login");
    await login(page, credentials.a);
    await expect(page).toHaveURL(/\/purchases(?:\?|$)/);
    const editUrl = `/purchases/${purchaseId}/edit`;
    await page.goto(editUrl);
    const staleTab = await context.newPage();
    try {
      await staleTab.goto(editUrl);
      await page.getByLabel("Pardavėjas").fill("Naujas pardavėjas");
      await page.getByLabel("Kada pirkote?").fill(newerDate);
      await page.getByLabel("Kaina").fill("25,50");
      await page.getByRole("button", { name: "Išsaugoti pakeitimus" }).click();
      await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}\\?state=updated$`));
      await staleTab.getByLabel("Pastabos").fill("Mano pastaba");
      await staleTab.getByRole("button", { name: "Išsaugoti pakeitimus" }).click();
      await expect(staleTab.getByText("Pirkinys buvo pakeistas kitur", { exact: false })).toBeVisible();
      await expect(staleTab.getByLabel("Pastabos")).toHaveValue("Mano pastaba");
      const staleResult = await client.from("purchases").select("seller_name,purchase_date,price_cents,notes").eq("id", purchaseId).single();
      expect(staleResult.data).toMatchObject({ seller_name: "Naujas pardavėjas", purchase_date: newerDate, price_cents: 2550, notes: null });
      await staleTab.reload();
      await staleTab.getByLabel("Pastabos").fill("Mano pastaba");
      await staleTab.getByRole("button", { name: "Išsaugoti pakeitimus" }).click();
      await expect(staleTab).toHaveURL(new RegExp(`/purchases/${purchaseId}\\?state=updated$`));
      expect((await client.from("purchases").select("seller_name,purchase_date,price_cents,notes").eq("id", purchaseId).single()).data)
        .toMatchObject({ seller_name: "Naujas pardavėjas", purchase_date: newerDate, price_cents: 2550, notes: "Mano pastaba" });
    } finally { await staleTab.close(); }
  } finally {
    await client.from("purchases").delete().eq("id", purchaseId);
    await client.auth.signOut();
  }
});
