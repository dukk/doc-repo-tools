/** Derive a package source filename from an OKF concept title. */
export function titleToSourceFilename(title: string): string {
  const stem = title
    .trim()
    .toLowerCase()
    .replace(/[''']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!stem) {
    throw new Error("Title must produce a non-empty source filename");
  }
  return `${stem}.md`;
}
