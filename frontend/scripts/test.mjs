import { buildSync } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bundle the actual feature services with Vite's existing esbuild dependency.
// Tests use Node's runner and mocked HTTP responses, without AWS or browser secrets.
const directory = mkdtempSync(join(tmpdir(), "roam-tests-"));
try {
  const output = join(directory, "integration.test.cjs");
  buildSync({
    entryPoints: ["tests/integration.test.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    define: { "import.meta.env": '{"VITE_USE_MOCKS":"false"}' },
  });
  execFileSync(process.execPath, ["--test", output], { stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
