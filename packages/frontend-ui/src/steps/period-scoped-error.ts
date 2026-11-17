"use client";

import { useState } from "react";

export type PeriodScopedError = {
  fiscalPeriodId: string | null;
  error: unknown;
};

export function errorShownIn(
  scoped: PeriodScopedError | null,
  fiscalPeriodId: string | null,
): unknown {
  return scoped != null && scoped.fiscalPeriodId === fiscalPeriodId
    ? scoped.error
    : null;
}

export function usePeriodScopedError(
  fiscalPeriodId: string | null,
): [unknown, (error: unknown) => void] {
  const [scoped, setScoped] = useState<PeriodScopedError | null>(null);
  return [
    errorShownIn(scoped, fiscalPeriodId),
    (error) => setScoped(error == null ? null : { fiscalPeriodId, error }),
  ];
}
