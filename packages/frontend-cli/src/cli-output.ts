export type CliOutput = {
  line(text: string): void;
  raw(text: string): void;
  json(value: unknown): void;
};

export class CliUsageError extends Error {}

export function createCliOutput(write: (text: string) => void): CliOutput {
  return {
    line: (text) => write(`${text}\n`),
    raw: (text) => write(text),
    json: (value) => write(`${JSON.stringify(value, null, 2)}\n`),
  };
}
