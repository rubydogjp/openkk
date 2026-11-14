import {
  OPENKK_BOOK_EXTENSION,
  OPENKK_BOOK_MIME_TYPE,
} from "./book-file-format.js";
import { browserFiles } from "./files.js";

export type BookFileDeliveryResult = "saved" | "cancelled";

const SAVE_PICKER_ID = "openkk-book";
const SAVE_PICKER_FILE_KIND = "オープン会計の帳簿";

type SaveFileWriter = {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};

type SaveFileHandle = {
  createWritable(): Promise<SaveFileWriter>;
};

type SaveFilePicker = (options: {
  id: string;
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFileHandle>;

type PickedSaveFile =
  | { kind: "picked"; handle: SaveFileHandle }
  | { kind: "cancelled" }
  | { kind: "unavailable" };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function saveFilePicker(): SaveFilePicker | null {
  const picker = (window as unknown as { showSaveFilePicker: unknown })
    .showSaveFilePicker;
  return typeof picker === "function"
    ? (picker.bind(window) as SaveFilePicker)
    : null;
}

async function pickSaveFile(fileName: string): Promise<PickedSaveFile> {
  const picker = saveFilePicker();
  if (picker == null) return { kind: "unavailable" };
  try {
    const handle = await picker({
      id: SAVE_PICKER_ID,
      suggestedName: fileName,
      types: [
        {
          description: SAVE_PICKER_FILE_KIND,
          accept: { [OPENKK_BOOK_MIME_TYPE]: [OPENKK_BOOK_EXTENSION] },
        },
      ],
    });
    return { kind: "picked", handle };
  } catch (error) {
    if (isAbortError(error)) return { kind: "cancelled" };
    console.error("[openkk] save file picker could not open:", error);
    return { kind: "unavailable" };
  }
}

async function writePickedFile(
  handle: SaveFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  const writer = await handle.createWritable();
  try {
    await writer.write(new Uint8Array(bytes));
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
}

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
  const picked = await pickSaveFile(fileName);
  if (picked.kind === "cancelled") return "cancelled";
  if (picked.kind === "picked") {
    await writePickedFile(picked.handle, bytes);
    return "saved";
  }
  const file = new File([new Uint8Array(bytes)], fileName, {
    type: OPENKK_BOOK_MIME_TYPE,
  });
  if (prefersShareSheet() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "saved";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
      throw error;
    }
  }
  browserFiles.save(bytes, fileName, OPENKK_BOOK_MIME_TYPE);
  return "saved";
}
