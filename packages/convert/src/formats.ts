export const SUPPORTED_FORMATS = ["pdf", "docx", "html", "pptx"] as const;
export type OutputFormat = (typeof SUPPORTED_FORMATS)[number];

export const EXT: Record<OutputFormat, string> = {
  pdf: ".pdf",
  docx: ".docx",
  html: ".html",
  pptx: ".pptx",
};

export function parseFormats(raw: string): OutputFormat[] {
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error("At least one format value is required");
  }
  const invalid = parts.filter(
    (p) => !SUPPORTED_FORMATS.includes(p as OutputFormat),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported format(s): ${invalid.join(", ")}. Supported: ${SUPPORTED_FORMATS.join(", ")}`,
    );
  }
  return [...new Set(parts)] as OutputFormat[];
}
