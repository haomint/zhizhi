import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Layer rules from AGENTS.md. Change both together, and explain why in the PR.
const src = path.resolve(import.meta.dirname, "../src");
const rules = {
  ui: {
    internal: ["ui", "application", "contracts"],
    external: ["react", "react-dom"],
  },
  application: {
    internal: ["application", "core", "platform", "contracts"],
    external: [],
  },
  core: {
    internal: ["core", "contracts"],
    external: [
      "@earendil-works/pi-agent-core",
      "@earendil-works/pi-ai",
      "typebox",
    ],
  },
  platform: {
    internal: [
      "platform",
      "contracts",
      "core/domain",
      "../config/providers.json",
    ],
    external: ["@capacitor/core"],
  },
};
const browserGlobals =
  /\b(window|localStorage|sessionStorage|navigator)\s*\.|\bdocument\.(createElement|querySelector|getElementById|body)\b/;
const escapes =
  /:\s*any\b|\bas any\b|<any>|@ts-ignore|@ts-nocheck|@ts-expect-error/;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
const sources = files(src).map((file) => ({
  file,
  name: path.relative(src, file).replaceAll("\\", "/"),
  text: fs.readFileSync(file, "utf8"),
}));
function layerOf(name) {
  return name.split("/")[0].replace(/\.tsx?$/, "");
}
function importsOf({ file, text }) {
  const statements =
    /^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"'\n]+)["']|^\s*import\s*["']([^"'\n]+)["']|\bimport\(\s*["']([^"'\n]+)["']\s*\)/gm;
  const specs = [...text.matchAll(statements)].map((m) => [
    m[0],
    m[1] ?? m[2] ?? m[3],
  ]);
  return specs.map(([, spec]) => {
    if (!spec.startsWith(".")) return { spec, external: true };
    const target = path.relative(src, path.resolve(path.dirname(file), spec));
    return { spec, external: false, target: target.replaceAll("\\", "/") };
  });
}
function allowed(target, internal) {
  const bare = target.replace(/\.tsx?$/, "");
  return internal.some((rule) => bare === rule || bare.startsWith(`${rule}/`));
}

test("every source file belongs to a known layer", () => {
  const known = new Set([...Object.keys(rules), "contracts", "main"]);
  const unknown = sources
    .map((s) => s.name)
    .filter((n) => !known.has(layerOf(n)));
  assert.deepEqual(
    unknown,
    [],
    "新目录需要先在 AGENTS.md 和本测试里定义分层规则",
  );
});

test("layers only import what AGENTS.md allows", () => {
  const violations = [];
  for (const source of sources) {
    const rule = rules[layerOf(source.name)];
    if (!rule) continue;
    for (const dep of importsOf(source)) {
      const ok = dep.external
        ? dep.spec.startsWith("node:") === false &&
          rule.external.some(
            (pkg) => dep.spec === pkg || dep.spec.startsWith(`${pkg}/`),
          )
        : allowed(dep.target, rule.internal);
      if (!ok) violations.push(`${source.name} -> ${dep.spec}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("core and application stay free of browser globals", () => {
  const violations = sources
    .filter((s) => ["core", "application"].includes(layerOf(s.name)))
    .filter((s) => browserGlobals.test(s.text))
    .map((s) => s.name);
  assert.deepEqual(violations, []);
});

test("source never escapes the type checker", () => {
  const violations = sources.flatMap((s) =>
    s.text
      .split("\n")
      .map((line, i) => [line, i + 1])
      .filter(([line]) => escapes.test(line))
      .map(([, n]) => `${s.name}:${n}`),
  );
  assert.deepEqual(violations, []);
});
