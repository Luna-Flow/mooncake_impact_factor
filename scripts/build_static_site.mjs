import { rename, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const apiDir = path.join(root, "app", "api");
const parkedApiDir = path.join(root, "app", "__api_static_disabled");

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: false
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`));
      }
    });
    child.on("error", reject);
  });
}

async function main() {
  const hasApiDir = await exists(apiDir);
  if (hasApiDir) {
    if (await exists(parkedApiDir)) {
      throw new Error(`Temporary API park path already exists: ${parkedApiDir}`);
    }
    await rename(apiDir, parkedApiDir);
  }

  try {
    await run("moon", ["build", "src/static_search", "--target", "js"]);
    await run("next", ["build"], {
      ...process.env,
      NEXT_PUBLIC_APP_MODE: "static",
      NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? ""
    });
    await writeFile(path.join(root, "out", ".nojekyll"), "", "utf8");
  } finally {
    if (await exists(parkedApiDir)) {
      await rename(parkedApiDir, apiDir);
    }
  }
}

await main();
