import {
  assertTextFieldLength,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

export function assertNonBlankString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw serverValidationError(`${label} is required`, null);
  }
}

export function assertString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
}

export function assertNonBlankText(value: unknown, label: string): void {
  assertNonBlankString(value, label);
  assertTextFieldLength(value as string, label);
}

export function assertTextChange(
  value: unknown,
  previous: string | null,
  label: string,
): asserts value is string {
  assertString(value, label);
  if (value !== previous) assertTextFieldLength(value, label);
}

export function assertOptionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw serverValidationError(`${label} must be a boolean`, null);
  }
}

export function assertObject(
  value: unknown,
  label: string,
): asserts value is object {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw serverValidationError(`${label} must be an object`, null);
  }
}
