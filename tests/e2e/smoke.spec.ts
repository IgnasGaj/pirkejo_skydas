import { expect, test, type Page } from "@playwright/test";

function watchApplicationErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

function recentVilniusDate(daysAgo: number) {
  const instant = new Date(Date.now() - daysAgo * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

test("public routes and navigation load without runtime errors", async ({ page }) => {
  const errors = watchApplicationErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pirkėjo Skydas" })).toBeVisible();
  await page.getByRole("link", { name: "Ar galiu grąžinti prekę?" }).click();
  await expect(page.getByRole("heading", { name: "Ar prekė yra sugedusi arba nekokybiška?" })).toBeVisible();
  await page.getByRole("link", { name: "Pirkėjo Skydas" }).click();
  await page.getByRole("link", { name: "Prekė sugedo" }).click();
  await expect(page.getByRole("heading", { name: "Kas įsigijo prekę?" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("private routes retain a safe internal return path", async ({ page }) => {
  const errors = watchApplicationErrors(page);
  for (const path of ["/purchases", "/purchases/new", "/purchases/00000000-0000-4000-8000-000000000000", "/purchases/00000000-0000-4000-8000-000000000000/edit"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.getByRole("heading", { name: "Mano pirkiniai" })).toBeVisible();
  }
  await page.goto("/login?next=https%3A%2F%2Fevil.example");
  await expect(page.locator('input[name="next"]').first()).toHaveValue("/purchases");
  const access = await page.request.get("/api/purchases/00000000-0000-4000-8000-000000000000/documents/00000000-0000-4000-8000-000000000001/access", { maxRedirects: 0 });
  expect(access.status()).toBe(404);
  expect(access.headers()["location"]).toBeUndefined();
  expect(errors).toEqual([]);
});

test("return flow reaches an eligible result", async ({ page }) => {
  const errors = watchApplicationErrors(page);
  await page.goto("/returns");
  for (const label of ["Ne", "Aš kaip privatus asmuo", "Parduotuvės / įmonės"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await page.getByRole("button", { name: /^Fizinėje parduotuvėje/ }).click();
  await page.getByLabel("Data").fill(recentVilniusDate(3));
  await page.getByRole("button", { name: "Toliau" }).click();
  for (const label of ["Drabužiai / avalynė", "Suaugusiųjų viršutiniai drabužiai arba avalynė", "Ne", "Taip", "Turiu čekį"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Pagal pateiktą informaciją galite turėti teisę grąžinti arba pakeisti prekę" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oficialūs šaltiniai" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("defective product flow reaches a repair or replacement result", async ({ page }) => {
  const errors = watchApplicationErrors(page);
  await page.goto("/defective-product");
  for (const label of ["Aš kaip privatus asmuo", "Parduotuvės / įmonės", "Fizinė prekė", "Nauja"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await page.getByLabel("Data").fill(recentVilniusDate(30));
  await page.getByRole("button", { name: "Toliau" }).click();
  await page.getByLabel("Data").fill(recentVilniusDate(5));
  await page.getByRole("button", { name: "Toliau" }).click();
  for (const label of ["Prekė sugedo arba trūkumas atsirado įprastai naudojant", "Turiu čekį", "Ne", "Pakeisti prekę"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Pirmas žingsnis – raštu kreiptis į pardavėją" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oficialūs šaltiniai" })).toBeVisible();
  expect(errors).toEqual([]);
});
