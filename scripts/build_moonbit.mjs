// Builds the MoonBit packages the web code imports and copies their ES
// modules into lib/moonbit/<package>/ (git-ignored):
//
//   lib/moonbit/query/query.js             query language (lib/query.ts)
//   lib/moonbit/query_sql/query_sql.js     SQL compiler (lib/data.ts)
//   lib/moonbit/static_search/static_search.js
//                                          static search engine (lib/static-search.ts)
//
// Each folder also receives the generated .d.ts and moonbit.d.ts. Run it
// with `node scripts/build_moonbit.mjs`; the npm scripts call it before
// dev, build, typecheck and test.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["query", "query_sql", "static_search"];
const buildDir = path.join(root, "_build", "js", "release", "build");
const outDir = path.join(root, "lib", "moonbit");

const result = spawnSync(
  "moon",
  ["build", ...packages.map((name) => `src/${name}`), "--target", "js", "--release"],
  { cwd: root, stdio: "inherit", shell: false }
);
if (result.error) {
  console.error(`build_moonbit: cannot run moon: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

rmSync(outDir, { recursive: true, force: true });
for (const name of packages) {
  const target = path.join(outDir, name);
  mkdirSync(target, { recursive: true });
  for (const file of [`${name}.js`, `${name}.d.ts`, "moonbit.d.ts"]) {
    copyFileSync(path.join(buildDir, name, file), path.join(target, file));
  }
}
console.log(`build_moonbit: wrote ${packages.map((name) => `lib/moonbit/${name}`).join(", ")}`);
