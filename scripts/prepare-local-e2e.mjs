import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const output = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
const entries = Object.fromEntries(output.split("\n").map((line) => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  return match ? [match[1], match[2].replace(/^"|"$/g, "")] : [];
}).filter((entry) => entry.length === 2));
const url = entries.API_URL ?? entries.SUPABASE_URL;
const key = entries.PUBLISHABLE_KEY ?? entries.ANON_KEY;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? "") || !key) throw new Error("Disposable local Supabase is required");
const complaintSigningKey = randomBytes(32).toString("hex");
execFileSync("docker", ["exec", "supabase_db_pirkejo-skydas", "psql", "-U", "postgres", "-d", "postgres", "-c",
  `insert into complaint_private.signing_key(singleton,secret) values(true,'${complaintSigningKey}') on conflict(singleton) do update set secret=excluded.secret;`], { stdio: "ignore" });
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function createUser(label) {
  const email = `receipt-${label}-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}-aA1!`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.user || !data.session) throw new Error(`Could not create local account ${label}: ${error?.message ?? "confirmation is enabled"}`);
  await client.auth.signOut();
  return { id: data.user.id, email, password };
}
const credentials = { url, key, a: await createUser("a"), b: await createUser("b") };
const path = `/tmp/pirkejo-e2e-${randomUUID()}.json`;
writeFileSync(path, JSON.stringify(credentials), { mode: 0o600 });
process.stdout.write(`NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nCOMPLAINT_SIGNING_KEY=${complaintSigningKey}\nE2E_AUTH_LOCAL=1\nE2E_AUTH_CREDENTIALS_FILE=${path}\n`);
