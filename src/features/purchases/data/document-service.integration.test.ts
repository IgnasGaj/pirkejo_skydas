import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database, Update } from "@/lib/supabase/database.types";
import type { PurchaseDocument } from "../domain/types";

vi.mock("server-only", () => ({}));
import { removeDocument, saveDocument } from "./document-service";
import { listUnfinishedPurchaseDocuments } from "./purchases";

type User = { id: string; email: string; password: string };
type Credentials = { url: string; key: string; a: User; b: User };
const credentialsFile = process.env.E2E_AUTH_CREDENTIALS_FILE;
const localOnly = credentialsFile ? JSON.parse(readFileSync(credentialsFile, "utf8")) as Credentials : null;
const integration = localOnly && /^http:\/\/127\.0\.0\.1:\d+$/.test(localOnly.url) ? it : it.skip;

function faultyClient(real: SupabaseClient<Database>, options: { failReady?: boolean; failRemoveOnce?: boolean; pretendRemoveOnce?: boolean; failDeleteOnce?: boolean;
  beforeUpload?: () => Promise<void> } = {}) {
  let removeFailed = false, deleteFailed = false;
  const bucket = real.storage.from("purchase-evidence");
  return {
    from(table: "purchase_documents") {
      const source = real.from(table);
      return {
        insert: source.insert.bind(source),
        update(value: Update<"purchase_documents">) {
          if (options.failReady && value.upload_state === "READY") return {
            eq() { return this; }, select() { return this; },
            async maybeSingle() { return { data: null, error: new Error("Injected READY failure") }; }
          };
          return source.update(value);
        },
        delete() {
          if (options.failDeleteOnce && !deleteFailed) {
            deleteFailed = true;
            return { eq() { return this; }, then(resolve: (value: { error: Error }) => void) {
              return Promise.resolve({ error: new Error("Injected metadata deletion failure") }).then(resolve);
            } };
          }
          return source.delete();
        }
      };
    },
    storage: { from() { return {
      upload: async (path: string, file: File, optionsForUpload: { contentType: string; upsert: boolean }) => {
        await options.beforeUpload?.();
        return bucket.upload(path, file, optionsForUpload);
      },
      remove: (paths: string[]) => {
        if (options.failRemoveOnce && !removeFailed) {
          removeFailed = true;
          return Promise.resolve({ data: null, error: new Error("Injected Storage removal failure") });
        }
        if (options.pretendRemoveOnce && !removeFailed) {
          removeFailed = true;
          return Promise.resolve({ data: [], error: null });
        }
        return bucket.remove(paths);
      },
      list: bucket.list.bind(bucket)
    }; } }
  } as unknown as SupabaseClient<Database>;
}

async function setup() {
  const credentials = localOnly!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const a = createClient<Database>(credentials.url, credentials.key, options);
  const b = createClient<Database>(credentials.url, credentials.key, options);
  expect((await a.auth.signInWithPassword(credentials.a)).error).toBeNull();
  expect((await b.auth.signInWithPassword(credentials.b)).error).toBeNull();
  const purchaseId = randomUUID(), documentId = randomUUID();
  const path = `${credentials.a.id}/${purchaseId}/${documentId}.pdf`;
  const inserted = await a.from("purchases").insert({ id: purchaseId, user_id: credentials.a.id,
    product_name: "Bandomas įrodymas", seller_name: "Bandymų pardavėjas", purchase_date: "2026-10-01", purchase_channel: "PHYSICAL_STORE" });
  expect(inserted.error).toBeNull();
  const metadata = { id: documentId, user_id: credentials.a.id, purchase_id: purchaseId, document_type: "RECEIPT" as const,
    original_filename: "bandymas.pdf", storage_path: path, mime_type: "application/pdf", size_bytes: 8 };
  const file = new File(["%PDF-1.4"], "bandymas.pdf", { type: "application/pdf" });
  async function cleanup() {
    await a.storage.from("purchase-evidence").remove([path]);
    await a.from("purchases").delete().eq("id", purchaseId);
    await a.auth.signOut(); await b.auth.signOut();
  }
  async function objectExists() {
    const listed = await a.storage.from("purchase-evidence").list(`${credentials.a.id}/${purchaseId}`);
    expect(listed.error).toBeNull();
    return listed.data?.some((item) => item.name === `${documentId}.pdf`) ?? false;
  }
  return { a, b, metadata, file, cleanup, objectExists, credentials };
}

integration("retains owned, non-READY metadata after failed cleanup and removes it on retry", async () => {
  const test = await setup();
  try {
    await expect(saveDocument(faultyClient(test.a, { failReady: true, failRemoveOnce: true }), test.metadata, test.file))
      .rejects.toThrow("Document upload cleanup failed");
    const row = await test.a.from("purchase_documents").select("*").eq("id", test.metadata.id).single();
    expect(row.error).toBeNull();
    expect(row.data?.upload_state).toBe("DELETING");
    expect((await listUnfinishedPurchaseDocuments(test.a, test.credentials.a.id, test.metadata.purchase_id)).map((item) => item.id)).toContain(test.metadata.id);
    expect(await test.objectExists()).toBe(true);
    expect((await test.b.from("purchase_documents").select("id").eq("id", test.metadata.id)).data).toEqual([]);
    await expect(removeDocument(test.b, test.credentials.b.id, row.data as PurchaseDocument)).rejects.toThrow("no owned row");
    expect(await test.objectExists()).toBe(true);
    await removeDocument(test.a, test.credentials.a.id, row.data as PurchaseDocument);
    expect((await test.a.from("purchase_documents").select("id").eq("id", test.metadata.id)).data).toEqual([]);
    expect(await test.objectExists()).toBe(false);
  } finally { await test.cleanup(); }
});

integration("retries metadata deletion after confirmed Storage cleanup", async () => {
  const test = await setup();
  try {
    await expect(saveDocument(faultyClient(test.a, { failReady: true, failDeleteOnce: true }), test.metadata, test.file))
      .rejects.toThrow("Document upload cleanup failed");
    const row = await test.a.from("purchase_documents").select("*").eq("id", test.metadata.id).single();
    expect(row.data?.upload_state).toBe("DELETING");
    expect(await test.objectExists()).toBe(false);
    await removeDocument(test.a, test.credentials.a.id, row.data as PurchaseDocument);
    expect((await test.a.from("purchase_documents").select("id").eq("id", test.metadata.id)).data).toEqual([]);
  } finally { await test.cleanup(); }
});

integration("retains metadata when Storage returns success without removing its object", async () => {
  const test = await setup();
  try {
    await expect(saveDocument(faultyClient(test.a, { failReady: true, pretendRemoveOnce: true }), test.metadata, test.file))
      .rejects.toThrow("Document upload cleanup failed");
    const row = await test.a.from("purchase_documents").select("*").eq("id", test.metadata.id).single();
    expect(row.data?.upload_state).toBe("DELETING");
    expect(await test.objectExists()).toBe(true);
    await removeDocument(test.a, test.credentials.a.id, row.data as PurchaseDocument);
    expect((await test.a.from("purchase_documents").select("id").eq("id", test.metadata.id)).data).toEqual([]);
    expect(await test.objectExists()).toBe(false);
  } finally { await test.cleanup(); }
});

integration("keeps a tombstone while deletion overlaps a late ordinary upload", async () => {
  const test = await setup();
  let release!: () => void;
  let uploading!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { uploading = resolve; });
  try {
    const save = saveDocument(faultyClient(test.a, { beforeUpload: async () => { uploading(); await held; } }), test.metadata, test.file);
    await started;
    const pending = await test.a.from("purchase_documents").select("*").eq("id", test.metadata.id).single();
    expect(pending.data?.upload_state).toBe("PENDING");
    await expect(removeDocument(test.a, test.credentials.a.id, pending.data as PurchaseDocument)).rejects.toThrow("still in progress");
    expect((await test.a.from("purchase_documents").select("upload_state").eq("id", test.metadata.id).single()).data?.upload_state).toBe("DELETING");
    release();
    await expect(save).rejects.toThrow("Upload claim changed");
    expect((await test.a.from("purchase_documents").select("id").eq("id", test.metadata.id)).data).toEqual([]);
    expect(await test.objectExists()).toBe(false);
  } finally { release(); await test.cleanup(); }
});
