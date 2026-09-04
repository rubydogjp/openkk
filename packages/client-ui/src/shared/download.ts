"use client";

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  type: string,
) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    revokeObjectUrlAfterCurrentTask(url);
  }
}

function revokeObjectUrlAfterCurrentTask(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
