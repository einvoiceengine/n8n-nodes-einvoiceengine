// Copies node icons and codex files next to the compiled JavaScript (replaces the gulp step of the starter).
import { cpSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const src of [...walk("nodes"), ...walk("credentials")].filter((f) => /\.(svg|png|json)$/.test(f))) cpSync(src, join("dist", src));
