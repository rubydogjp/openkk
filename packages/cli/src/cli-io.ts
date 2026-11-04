export type CliIo = {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd: string;
  env(name: string): string | null;
  now(): Date;
};

export type CliOutput = {
  line(text: string): void;
  raw(text: string): void;
  json(value: unknown): void;
};

export class CliUsageError extends Error {}

export function createCliOutput(io: CliIo): CliOutput {
  return {
    line: (text) => io.stdout(`${text}\n`),
    raw: (text) => io.stdout(text),
    json: (value) => io.stdout(`${JSON.stringify(value, null, 2)}\n`),
  };
}
