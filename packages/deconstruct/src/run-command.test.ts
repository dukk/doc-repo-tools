import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultRunCommand } from "./run-command.js";

describe("defaultRunCommand", () => {
  it("runs a command and captures stdout", async () => {
    const cmd = process.platform === "win32" ? "cmd" : "echo";
    const args =
      process.platform === "win32" ? ["/c", "echo hello"] : ["hello"];
    const result = await defaultRunCommand(cmd, args);
    assert.equal(result.code, 0);
    assert.match(result.stdout.trim(), /hello/);
  });
});
