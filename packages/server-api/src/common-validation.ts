import { serverValidationError } from "@rubydogjp/openkk-server-domain";

export function assertNonBlankString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw serverValidationError(`${label} is required`);
  }
}

export function assertString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`);
  }
}

export function assertOptionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw serverValidationError(`${label} must be a boolean`);
  }
}

export function assertObject(
  value: unknown,
  label: string,
): asserts value is object {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw serverValidationError(`${label} must be an object`);
  }
}
