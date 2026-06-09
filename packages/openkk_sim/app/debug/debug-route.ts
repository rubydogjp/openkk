import { notFound } from "next/navigation";

import { openkkConfig } from "../openkk-config";

export function assertDebugRouteEnabled(): void {
  if (!openkkConfig.debugRoutesEnabled) {
    notFound();
  }
}
