// A person is called by their own name. "Coach" is what Coach's team calls
// him, not what his fishing buddy, his dad or his nephew calls him, so no
// text a person can read in the app may use "Coach" as someone's name
// (Coach, 2026-11-26: "my name isn't coach to everyone else").
// Looks at every string literal in the page and the crew client.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log("ok   " + m); } else { fail++; console.log("FAIL " + m + (d ? "\n     " + d : "")); } };

for (const f of ["rigs/index.html", "rigs/crew.js"]) {
  const src = readFileSync(resolve(ROOT, f), "utf8");
  const hits = [];
  src.split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;              // a comment line
    const lits = line.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g) || [];
    for (const s of lits) if (/\bCoach\b/.test(s)) hits.push((i + 1) + ": " + s.slice(0, 90));
  });
  ok(hits.length === 0, f + ": no text a person reads calls anyone \"Coach\"", hits.join("\n     "));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
