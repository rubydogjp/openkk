import { notFound } from "next/navigation";

import { DEBUG_ROUTES_ENABLED } from "../openkk-config";

export function assertDebugRouteEnabled(): void {
  if (!DEBUG_ROUTES_ENABLED) {
    notFound();
  }
}
