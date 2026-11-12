export interface BookStore {
  list(): Promise<string[]>;
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
}

export function createMemoryBookStore(
  initialBooks: ReadonlyMap<string, Uint8Array>,
): BookStore {
  const books = new Map(
    [...initialBooks].map(([name, bytes]) => [name, bytes.slice()]),
  );
  return {
    async list() {
      return [...books.keys()];
    },
    async read(name) {
      return books.get(name)?.slice() ?? null;
    },
    async write(name, bytes) {
      books.set(name, bytes.slice());
    },
    async remove(name) {
      books.delete(name);
    },
  };
}
