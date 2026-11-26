// Fails when a string key exists in one language only, or a value is empty.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");
const block = (name) => {
  const start = src.indexOf(`export const ${name}`);
  const body = src.slice(start, src.indexOf("\n};", start) + 3);
  return new Map([...body.matchAll(/^\s+"([\w.]+)":\s*"(.*)",?$/gm)].map((m) => [m[1], m[2]]));
};
const en = block("en"), zh = block("zh");
const problems = [];
for (const k of en.keys()) if (!zh.has(k)) problems.push(`missing in 中文: ${k}`);
for (const k of zh.keys()) if (!en.has(k)) problems.push(`missing in English: ${k}`);
for (const [lang, m] of [["en", en], ["zh", zh]]) for (const [k, v] of m) if (!v.trim()) problems.push(`empty in ${lang}: ${k}`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`i18n: ${en.size} keys, both languages complete`);
