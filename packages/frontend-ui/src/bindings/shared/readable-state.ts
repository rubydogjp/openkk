"use client";

import { useSyncExternalStore } from "react";
import type { ReadableState } from "@rubydogjp/openkk-driver";

export function useReadableState<Value>(state: ReadableState<Value>): Value {
  return useSyncExternalStore(state.subscribe, state.getState, state.getState);
}
