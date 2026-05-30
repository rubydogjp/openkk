"use client";

import { useCallback } from "react";
import { usePrintAdapter } from "../shared/print-adapter-context";

export function usePrintDocument(): (html: string) => void {
  const adapter = usePrintAdapter();
  return useCallback((html: string) => adapter.openPrint(html), [adapter]);
}
