export const IN_APP_BOOKS_DIRECTORY = "openkk-books";
export const PENDING_COPY_SUFFIX = ".next";
export const READY_MARK_SUFFIX = ".ready";

const READY_MARK = new Uint8Array(0);

export type BookDirectory = {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
};

export type BookRequest =
  | { type: "write"; name: string; bytes: Uint8Array }
  | { type: "recover"; name: string }
  | { type: "remove"; name: string };

export async function writeBook(
  directory: BookDirectory,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  await directory.write(`${name}${PENDING_COPY_SUFFIX}`, bytes);
  await directory.write(`${name}${READY_MARK_SUFFIX}`, READY_MARK);
  await directory.write(name, bytes);
  await directory.remove(`${name}${READY_MARK_SUFFIX}`);
  await directory.remove(`${name}${PENDING_COPY_SUFFIX}`);
}

export async function recoverBook(
  directory: BookDirectory,
  name: string,
): Promise<void> {
  if ((await directory.read(`${name}${READY_MARK_SUFFIX}`)) != null) {
    const pending = await directory.read(`${name}${PENDING_COPY_SUFFIX}`);
    if (pending != null) await directory.write(name, pending);
    await directory.remove(`${name}${READY_MARK_SUFFIX}`);
  }
  await directory.remove(`${name}${PENDING_COPY_SUFFIX}`);
}

export async function removeBook(
  directory: BookDirectory,
  name: string,
): Promise<void> {
  await directory.remove(`${name}${READY_MARK_SUFFIX}`);
  await directory.remove(`${name}${PENDING_COPY_SUFFIX}`);
  await directory.remove(name);
}

export async function runBookRequest(
  directory: BookDirectory,
  request: BookRequest,
): Promise<void> {
  switch (request.type) {
    case "write":
      return writeBook(directory, request.name, request.bytes);
    case "recover":
      return recoverBook(directory, request.name);
    case "remove":
      return removeBook(directory, request.name);
  }
}
