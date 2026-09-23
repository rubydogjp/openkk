import {
  assertNonBlankString,
  assertTextFieldLength,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

export function assertString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
}

export function assertNonBlankTextField(
  value: unknown,
  label: string,
): asserts value is string {
  assertNonBlankString(value, label);
  assertTextFieldLength(value, label);
}

export function assertTextFieldChange(
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
