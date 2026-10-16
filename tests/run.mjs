import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const directory = new URL("./.generated/", import.meta.url);
await mkdir(directory, { recursive: true });
let failed = false;
try {
  for (const name of [
    "engines",
    "solver",
    "complex",
    "probability",
    "textbook",
    "geometry",
    "curriculum",
    "school-safety",
    "matrices",
  ]) {
    const output = new URL(`${name}.mjs`, directory).pathname;
    await build({
      entryPoints: [new URL(`./${name}.test.ts`, import.meta.url).pathname],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      target: "node20",
      logLevel: "warning",
    });
    const result = spawnSync(process.execPath, [output], { stdio: "inherit" });
    if (result.status !== 0) failed = true;
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
