import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  version: string;
  scripts: Record<string, string>;
};
assert(existsSync(resolve(root, "src/main.tsx")));
assert(existsSync(resolve(root, "tsconfig.json")));
const config = JSON.parse(
  readFileSync(resolve(root, "capacitor.config.json"), "utf8"),
) as { webDir: string; appId: string };
assert.equal(config.webDir, "dist");
assert.equal(config.appId, "app.zhizhi.personal");
const manifest = JSON.parse(
  readFileSync(resolve(root, "skills/manifest.json"), "utf8"),
) as { skills: Record<string, { file: string }> };
for (const rule of Object.values(manifest.skills))
  assert(existsSync(resolve(root, "public/skills", rule.file)));
assert.equal(
  readdirSync(resolve(root, "src/core")).filter((n) => n.endsWith(".mjs"))
    .length,
  0,
);
const build = JSON.parse(
  readFileSync(resolve(root, "dist/build-info.json"), "utf8"),
) as { version: string; ui: string; language: string };
assert.equal(build.version, pkg.version);
assert.equal(build.ui, "React");
assert.equal(build.language, "TypeScript");
console.log(
  "PASS: React/TypeScript entry, generated assets, Android identity, and build version.",
);
