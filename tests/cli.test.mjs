import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "_build/js/debug/build/cli/cli.js");

const build = spawnSync("moon", ["build", "src/cli", "--target", "js"], {
  cwd: root,
  encoding: "utf8"
});
assert.equal(build.status, 0, build.stderr || build.stdout);

test("build-index reports an unreadable input as JSON", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "mooncake-impact-cli-"));
  try {
    const missing = path.join(tempDir, "missing.json");
    const result = spawnSync("node", [cli, "build-index", "--input", missing], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), { error: `Failed to read input: ${missing}` });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
