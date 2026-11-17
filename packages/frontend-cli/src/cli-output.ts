export type CliOutput = {
  line(text: string): void;
  raw(text: string): void;
  json(value: unknown): void;
};

import { AppError } from "@rubydogjp/openkk-driver";

export class CliUsageError extends Error {}

export function cliRefusal(messageForUser: string): AppError {
  return new AppError({
    messageForDeveloper: "cli: the command was refused in the current state",
    messageForUser,
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}

const TERMINAL_CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

export function printableTerminalText(text: string): string {
  return text.replace(
    TERMINAL_CONTROL_CHARACTERS,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function createCliOutput(write: (text: string) => void): CliOutput {
  return {
    line: (text) => write(`${printableTerminalText(text)}\n`),
    raw: (text) => write(text),
    json: (value) => write(`${JSON.stringify(value, null, 2)}\n`),
  };
}
