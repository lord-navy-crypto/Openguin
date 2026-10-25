export type DiagnosticValue = Record<string, unknown>;

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" :
    typeof value === "string" ? value :
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+@]/.test(text) || /^[\s]*-[A-Za-z]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/**
 * Flatten a sanitized diagnostic bundle into a spreadsheet-friendly table.
 * Each row is one scalar value, preserving nested object paths and array indices.
 */
export function diagnosticBundleToCsv(bundle: DiagnosticValue): string {
  const rows: string[][] = [["section", "field", "value"]];
  const visit = (section: string, path: string, value: unknown): void => {
    if (value === null || value === undefined) {
      rows.push([section, path, ""]);
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) rows.push([section, path, "[]"]);
      else value.forEach((item, index) => visit(section, path + "[" + index + "]", item));
      return;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) rows.push([section, path, "{}"]);
      else entries.forEach(([key, item]) => visit(section, path ? path + "." + key : key, item));
      return;
    }
    rows.push([section, path, String(value)]);
  };
  for (const [section, value] of Object.entries(bundle)) visit(section, section, value);
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadDiagnosticText(
  content: string,
  filename: string,
  mimeType: string
): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("此环境不支持直接下载文件，请使用复制报告功能。");
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
