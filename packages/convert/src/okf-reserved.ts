import path from "node:path";

export const OKF_RESERVED_MARKDOWN = new Set(["index.md", "log.md"]);

export function isOkfReservedMarkdown(relativePath: string): boolean {
  const base = path.posix.basename(relativePath).toLowerCase();
  return OKF_RESERVED_MARKDOWN.has(base);
}
