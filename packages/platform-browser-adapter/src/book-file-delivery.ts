import { OPENKK_BOOK_MIME_TYPE } from "./book-file-format.js";
import { browserFiles } from "./files.js";

export type BookFileDeliveryResult = "saved" | "cancelled";

function prefersShareSheet(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export async function deliverBookFile(
  bytes: Uint8Array,
  fileName: string,
): Promise<BookFileDeliveryResult> {
  const file = new File([new Uint8Array(bytes)], fileName, {
    type: OPENKK_BOOK_MIME_TYPE,
  });
  if (prefersShareSheet() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      throw error;
    }
  }
  browserFiles.save(bytes, fileName, OPENKK_BOOK_MIME_TYPE);
  return "saved";
}
