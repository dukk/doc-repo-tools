import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256File(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}
