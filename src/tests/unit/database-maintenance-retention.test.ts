import { describe, expect, it } from "vitest";

import {
  runBatchedDelete,
  type RetentionClient,
} from "@/scripts/database-maintenance-retention";

type Call = { text: string; params?: unknown[] };

function fakeClient(rowCounts: number[]) {
  const calls: Call[] = [];
  let deleteIndex = 0;

  const client: RetentionClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.startsWith("SELECT pg_sleep")) {
        return { rowCount: 1 };
      }
      const value = rowCounts[Math.min(deleteIndex, rowCounts.length - 1)] ?? 0;
      deleteIndex += 1;
      return { rowCount: value };
    },
  };

  return { client, calls };
}

describe("runBatchedDelete", () => {
  it("stops early when a batch is not full and never sleeps after the last batch", async () => {
    const { client, calls } = fakeClient([5, 2]);
    const result = await runBatchedDelete(client, {
      table: "outbox_events",
      predicate: "published_at < now()",
      params: [],
      batchSize: 5,
      maxBatches: 10,
      sleepMs: 100,
    });

    expect(result).toEqual({ deleted: 7, truncated: false });
    const sleeps = calls.filter((call) => call.text.startsWith("SELECT pg_sleep"));
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]?.params).toEqual([0.1]);
  });

  it("reports truncation when it reaches the per-run batch ceiling", async () => {
    const { client, calls } = fakeClient([3]);
    const result = await runBatchedDelete(client, {
      table: "carts",
      predicate: "expires_at < now()",
      params: ["14"],
      batchSize: 3,
      maxBatches: 4,
      sleepMs: 0,
    });

    expect(result).toEqual({ deleted: 12, truncated: true });
    const deletes = calls.filter((call) => !call.text.startsWith("SELECT pg_sleep"));
    expect(deletes).toHaveLength(4);
  });

  it("binds the batch size as the final parameter and scopes the delete by ctid", async () => {
    const { client, calls } = fakeClient([1]);
    await runBatchedDelete(client, {
      table: "storefront_item_events",
      predicate: "occurred_at < now() - ($1 || ' days')::interval",
      params: [90],
      batchSize: 2000,
      maxBatches: 10,
      sleepMs: 0,
    });

    const [first] = calls;
    expect(first?.text).toContain("DELETE FROM storefront_item_events AS target");
    expect(first?.text).toContain("USING batch");
    expect(first?.text).toContain("WHERE target.ctid = batch.ctid");
    expect(first?.params).toEqual([90, 2000]);
  });
});
