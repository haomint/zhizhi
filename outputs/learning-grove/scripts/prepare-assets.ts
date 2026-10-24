import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
mkdirSync(resolve(root, "public/skills"), { recursive: true });
for (const name of readdirSync(resolve(root, "skills")))
  copyFileSync(
    resolve(root, "skills", name),
    resolve(root, "public/skills", name),
  );
copyFileSync(
  resolve(root, "node_modules/@capacitor/android/LICENSE"),
  resolve(root, "public/CAPACITOR-ANDROID-LICENSE.txt"),
);
const manifest = JSON.parse(
  readFileSync(resolve(root, "skills/manifest.json"), "utf8"),
) as { skills: Record<string, unknown> };
console.log(`Prepared ${Object.keys(manifest.skills).length} teaching rules.`);
