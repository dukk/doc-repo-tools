import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";

describe("hash", () => {
  it("hashes file contents", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { sha256File } = await import("./hash.js");
    const dir = mkdtempSync(path.join(tmpdir(), "hash-"));
    const file = path.join(dir, "x.txt");
    writeFileSync(file, "hello", "utf8");
    const expected = createHash("sha256").update("hello").digest("hex");
    assert.equal(sha256File(file), expected);
    rmSync(dir, { recursive: true, force: true });
  });
});
