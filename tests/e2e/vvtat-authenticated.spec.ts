import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";
import { todayInVilnius } from "../../src/lib/date";

const enabled = process.env.E2E_AUTH_LOCAL === "1" && Boolean(process.env.E2E_AUTH_CREDENTIALS_FILE);
test.skip(!enabled, "Requires local Supabase and ordinary test accounts");

test("prepares a reviewed, pinned package and downloads verified originals", async ({ page }) => {
  test.setTimeout(120_000);
  const c = JSON.parse(readFileSync(process.env.E2E_AUTH_CREDENTIALS_FILE!, "utf8")) as {
    url: string; key: string; a: { id: string; email: string; password: string };
  };
  const a = createClient<Database>(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await a.auth.signInWithPassword(c.a)).error).toBeNull();
  const purchaseId = randomUUID(), complaintId = randomUUID(), versionId = randomUUID(), evidenceId = randomUUID();
  const path = `${c.a.id}/${purchaseId}/${evidenceId}.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4\nOriginalūs baitai\n");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const today = todayInVilnius();
  const purchase = await a.from("purchases").insert({ id: purchaseId, user_id: c.a.id, product_name: "Bandymų prekė",
    seller_name: "Bandymų pardavėjas", purchase_date: today, purchase_channel: "PHYSICAL_STORE" }).select("*").single();
  expect(purchase.error).toBeNull();
  try {
    expect((await a.from("complaints").insert({ id: complaintId, user_id: c.a.id, purchase_id: purchaseId,
      family: "DEFECTIVE_PRODUCT", request_id: randomUUID(), answers: {}, facts: {}, remedy: "REPAIR",
      purchase_updated_at: purchase.data!.updated_at, template_version: "test", source_version: "test" })).error).toBeNull();
    const sql = `insert into public.complaint_versions(id,user_id,purchase_id,complaint_id,version_no,request_id,document_date,snapshot,sections,plain_text,template_version,source_version) values ('${versionId}','${c.a.id}','${purchaseId}','${complaintId}',1,'${randomUUID()}','${today}','{"facts":{"consumerName":"Jonas Jonaitis","consumerEmail":"jonas@example.test","sellerName":"Bandymų pardavėjas","sellerContact":""},"purchase":{"seller_name":"Bandymų pardavėjas","product_name":"Bandymų prekė"}}','["Prašau pataisyti prekę."]','Prašau pataisyti prekę.','test','test')`;
    execFileSync("docker", ["exec", "supabase_db_pirkejo-skydas", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "ignore" });
    const created = await a.rpc("create_tracked_case", { p_version_id: versionId, p_request_id: randomUUID() });
    expect(created.error).toBeNull();
    const caseId = created.data!.id;
    expect((await a.rpc("record_case_event", { p_case_id: caseId, p_request_id: randomUUID(), p_expected_revision: 0,
      p_kind: "SUBMITTED", p_occurred_on: today, p_payload: { method: "EMAIL", note: "" } })).error).toBeNull();
    expect((await a.storage.from("purchase-evidence").upload(path, bytes, { contentType: "application/pdf", upsert: false })).error).toBeNull();
    expect((await a.from("purchase_documents").insert({ id: evidenceId, user_id: c.a.id, purchase_id: purchaseId,
      document_type: "OTHER", original_filename: "originalas.pdf", storage_path: path, mime_type: "application/pdf",
      size_bytes: bytes.length, content_sha256: hash, upload_state: "READY" })).error).toBeNull();
    await page.goto("/login");
    const login = page.getByRole("heading", { name: "Prisijungti" }).locator("..");
    await login.getByLabel("El. paštas").fill(c.a.email);
    await login.getByLabel("Slaptažodis").fill(c.a.password);
    await login.getByRole("button", { name: "Prisijungti" }).click();
    await expect(page).toHaveURL(/\/purchases/);
    await page.goto(`/cases/${caseId}`);
    await page.getByRole("link", { name: "Parengti dokumentų paketą VVTAT" }).click();
    await expect(page).toHaveURL(new RegExp(`/cases/${caseId}/vvtat`));
    await page.getByLabel("Ginčo esmė").fill("Prekė neveikia nuo pirkimo dienos.");
    await page.getByLabel("Kodėl siekiate tolesnės peržiūros?").fill("Pardavėjas nepasiūlė sprendimo.");
    await page.getByLabel("Ar tai jūsų kaip vartotojo įsigytos prekės ginčas?").selectOption("YES");
    await page.getByLabel("Ar pardavėjas veikė kaip verslininkas?").selectOption("YES");
    await page.getByLabel("Ar ginčas susijęs su pardavėju Lietuvoje?").selectOption("YES");
    await page.getByLabel("Ar dėl šio ginčo jau kreipėtės į kitą instituciją ar teismą?").selectOption("NO");
    await page.getByLabel("Ar šiam ginčui gali būti taikoma speciali ginčų institucija?").selectOption("NO");
    await page.getByText("originalas.pdf").locator("..", { has: page.locator("input[type=checkbox]") }).locator("input[type=checkbox]").check();
    await page.getByLabel("Peržiūrėjau santrauką, savo nurodytus faktus, pasirinktus failus ir trūkstamus duomenis.").check();
    const sent: unknown[] = [];
    let dropFirstResponse = true;
    await page.route(`**/api/cases/${caseId}/vvtat`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      sent.push(JSON.parse(route.request().postData()!));
      if (dropFirstResponse) {
        dropFirstResponse = false;
        const saved = await route.fetch();
        expect(saved.ok()).toBe(true);
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Parengti paketo versiją" }).click();
    await expect(page.getByText("Ryšys nutrūko.", { exact: false })).toBeVisible();
    await page.getByLabel("Ginčo esmė").fill("Naujesnis neišsaugotas aprašymas.");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("button", { name: "Pakartoti tą patį išsaugojimą" }).click();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    await expect(page.getByLabel("Ginčo esmė")).toHaveValue("Naujesnis neišsaugotas aprašymas.");
    await expect(page.getByText("Versija 1 ·", { exact: false })).toBeVisible();
    expect((await a.from("vvtat_packages").select("id").eq("case_id", caseId)).data).toHaveLength(1);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Atsisiųsti dokumentų paketą ZIP" }).click();
    const archive = unzipSync(new Uint8Array(readFileSync(await (await download).path())));
    expect(Object.keys(archive)).toContain("01-ginco-santrauka.pdf");
    expect(Object.keys(archive)).toContain("02-kreipimasis-pardavejui.txt");
    expect(strFromU8(archive["02-kreipimasis-pardavejui.txt"])).toBe("Prašau pataisyti prekę.");
    const selected = archive["irodymai/01-originalas.pdf"];
    expect(selected).toEqual(bytes);
    expect(strFromU8(archive["priedu-sarasas.txt"])).toContain(hash);
    expect((await a.rpc("record_case_event", { p_case_id: caseId, p_request_id: randomUUID(), p_expected_revision: 1,
      p_kind: "RESPONSE_RECORDED", p_occurred_on: today, p_payload: { outcome: "OTHER", summary: "Naujas įrašas", note: "" } })).error).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByText("Kreipimosi eiga pasikeitė nuo paketo parengimo.", { exact: false })).toBeVisible();
    expect((await a.storage.from("purchase-evidence").remove([path])).error).toBeNull();
    expect((await a.from("purchase_documents").delete().eq("id", evidenceId)).error).toBeNull();
    const failedExport = page.waitForResponse((response) => response.url().includes(`/vvtat/`) && response.url().includes("format=zip"));
    await page.getByRole("button", { name: "Atsisiųsti dokumentų paketą ZIP" }).click();
    expect((await failedExport).status()).toBe(409);
    await expect(page.getByText("Paketas parengtas, atsisiuntimas nepavyko.", { exact: false })).toBeVisible();
    expect((await a.from("vvtat_packages").select("id").eq("case_id", caseId)).data).toHaveLength(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await a.storage.from("purchase-evidence").remove([path]);
    await a.from("purchases").update({ deletion_state: "DELETING" }).eq("id", purchaseId);
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut();
  }
});
