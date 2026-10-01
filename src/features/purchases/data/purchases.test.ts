import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { deletePurchaseDocumentRow, deletePurchaseRow, listPurchases, purchaseIdsWithEvidence } from "./purchases";

function query(result: { data: unknown; error: Error | null }) {
  const chain = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), in: vi.fn(), delete: vi.fn(), maybeSingle: vi.fn()
  };
  for (const method of ["select", "eq", "order", "limit", "in", "delete"] as const) chain[method].mockReturnValue(chain);
  Object.assign(chain, { then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve) });
  chain.maybeSingle.mockResolvedValue(result);
  const client = createClient<Database>("https://example.supabase.co", "test-key");
  const from = vi.spyOn(client, "from").mockReturnValue(chain as never);
  return { chain, from, client };
}

describe("purchase query contracts", () => {
  it("limits dashboard rows in the query before awaiting them", async () => {
    const { client, chain } = query({ data: [], error: null });
    await listPurchases(client, "owner", 3);
    expect(chain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(chain.limit).toHaveBeenCalledOnce();
    expect(chain.limit).toHaveBeenCalledWith(3);
  });

  it("loads evidence metadata in one owner-scoped query", async () => {
    const { client, chain, from } = query({ data: [{ purchase_id: "a" }], error: null });
    expect(await purchaseIdsWithEvidence(client, "owner", ["a", "b"])).toEqual(new Set(["a"]));
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("purchase_documents");
    expect(chain.select).toHaveBeenCalledWith("purchase_id");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(chain.in).toHaveBeenCalledWith("purchase_id", ["a", "b"]);
  });

  it("does not show missing evidence when metadata query fails", async () => {
    const { client } = query({ data: null, error: new Error("Database unavailable") });
    await expect(purchaseIdsWithEvidence(client, "owner", ["a"])).rejects.toThrow("Database unavailable");
  });

  it("rejects RLS-filtered zero-row deletions", async () => {
    const { client } = query({ data: null, error: null });
    await expect(deletePurchaseRow(client, "owner", "purchase")).rejects.toThrow("no row");
    await expect(deletePurchaseDocumentRow(client, "owner", "document")).rejects.toThrow("no row");
  });
});
