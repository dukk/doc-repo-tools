import path from "node:path";

export function formatsForSource(sourcePath: string): string[] {
  const ext = path.extname(sourcePath).toLowerCase();
  switch (ext) {
    case ".pptx":
    case ".ppt":
      return ["pptx", "pdf"];
    case ".html":
    case ".htm":
      return ["html", "pdf", "docx"];
    case ".pdf":
      return ["pdf", "docx"];
    default:
      return ["pdf", "docx"];
  }
}

export function slugFromFilename(filePath: string): string {
  const stem = path.basename(filePath, path.extname(filePath));
  return (
    stem
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "document"
  );
}

export function titleFromFilename(filePath: string): string {
  const stem = path.basename(filePath, path.extname(filePath));
  const spaced = stem
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return "Document";
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}
