"use client";

import { createContext, useContext, type ReactNode } from "react";

export type OpenkkCalloutSlot = "stepNextFiscalPeriodDemoFooter";

export type OpenkkCalloutSlots = Partial<Record<OpenkkCalloutSlot, ReactNode>>;

const OpenkkCalloutsContext = createContext<OpenkkCalloutSlots>({});

export function OpenkkCalloutsProvider(props: {
  slots: OpenkkCalloutSlots;
  children: ReactNode;
}) {
  return (
    <OpenkkCalloutsContext.Provider value={props.slots}>
      {props.children}
    </OpenkkCalloutsContext.Provider>
  );
}

export function useOpenkkCallout(slot: OpenkkCalloutSlot): ReactNode {
  const slots = useContext(OpenkkCalloutsContext);
  return slots[slot] ?? null;
}
