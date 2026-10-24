import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  cpSync,
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  version: string;
};
const files = [
  "index.html",
  ...readdirSync(resolve(root, "dist/assets")).map((name) => "assets/" + name),
  "skills/manifest.json",
];
const hashes = Object.fromEntries(
  files.map((name) => [
    name,
    createHash("sha256")
      .update(readFileSync(resolve(root, "dist", name)))
      .digest("hex"),
  ]),
);
writeFileSync(
  resolve(root, "dist/build-info.json"),
  JSON.stringify(
    {
      version: pkg.version,
      language: "TypeScript",
      ui: "React",
      piVersion: "1.4.0",
      hashes,
    },
    null,
    2,
  ) + "\n",
);
// Keep the already-published preview process working while its next restart
// switches to dist. static is a generated mirror, never an application source.
const next = mkdtempSync(resolve(root, ".static-build-")),
  previous = next + "-old",
  target = resolve(root, "static");
cpSync(resolve(root, "dist"), next, { recursive: true });
// mkdtemp is private by default; the managed preview may run as another room user.
chmodSync(next, 0o2775);
if (existsSync(target)) renameSync(target, previous);
renameSync(next, target);
if (existsSync(previous)) rmSync(previous, { recursive: true, force: true });
