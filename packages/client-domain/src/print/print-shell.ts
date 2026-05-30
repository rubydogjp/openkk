export type PrintOrientation = "portrait" | "landscape";

export type BuildPrintDocumentArgs = {
  title: string;
  orientation: PrintOrientation;
  body: string;
};

export function buildPrintDocument({
  title,
  orientation,
  body,
}: BuildPrintDocumentArgs): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
@page { size: A4 ${orientation}; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: white; }
body { font-family: "Noto Sans JP", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
.bk-page { background: white; page-break-after: always; break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.bk-page:last-child { page-break-after: auto; break-after: auto; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
