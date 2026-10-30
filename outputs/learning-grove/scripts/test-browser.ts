import { fork } from "node:child_process";
import { resolve } from "node:path";
import { preview } from "vite";

// Serve the existing dist/ build, run the Playwright scenarios against it,
// and always stop the server. Reports go to test-results/browser (ignored).
const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.ZHIZHI_PORT || 5175);
const server = await preview({
  root,
  preview: { port, strictPort: true, host: "127.0.0.1" },
});
const code = await new Promise<number>((done) => {
  fork(resolve(root, "scripts/verify_react.cjs"), {
    env: {
      ...process.env,
      ZHIZHI_URL: `http://127.0.0.1:${port}/`,
      ZHIZHI_REPORT_DIR:
        process.env.ZHIZHI_REPORT_DIR || resolve(root, "test-results/browser"),
    },
    stdio: "inherit",
  }).on("exit", (exit) => done(exit ?? 1));
});
await server.close();
process.exitCode = code;
