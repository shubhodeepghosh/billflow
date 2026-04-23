import { mkdir, rm, cp } from "node:fs/promises";
import { join } from "node:path";

const source = join(process.cwd(), "dist", "client", "assets");
const target = join(process.cwd(), "public", "assets");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
