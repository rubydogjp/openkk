import type { OpenkkEnv } from "@rubydogjp/openkk-client";

const DEFAULT_ENV: OpenkkEnv = "prod";

export function parseOpenkkEnv(value: string | undefined): OpenkkEnv {
  switch (value) {
    case "dev":
    case "stg":
    case "prod":
      return value;
    default:
      return DEFAULT_ENV;
  }
}
