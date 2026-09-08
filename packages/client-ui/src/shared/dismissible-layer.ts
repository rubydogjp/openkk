"use client";

import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const activeLayerStack: symbol[] = [];

export function useDismissibleLayer<ElementType extends HTMLElement>(options: {
  open: boolean | null;
  onDismiss: () => void;
  initialFocusRef: RefObject<HTMLElement | null> | null;
  focusOnOpen: boolean | null;
  restoreFocus: boolean | null;
  trapFocus: boolean | null;
}): RefObject<ElementType | null> {
  const layerRef = useRef<ElementType>(null);
  const layerId = useRef(Symbol("dismissible-layer"));
  const onDismissRef = useRef(options.onDismiss);
  onDismissRef.current = options.onDismiss;
  const open = options.open ?? true;
  const focusOnOpen = options.focusOnOpen ?? true;
  const restoreFocus = options.restoreFocus ?? true;
  const trapFocus = options.trapFocus ?? false;

  useEffect(() => {
    if (!open) return;
    const id = layerId.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    activeLayerStack.push(id);

    if (focusOnOpen) {
      const initialFocus =
        options.initialFocusRef?.current ??
        layerRef.current?.querySelector<HTMLElement>(focusableSelector) ??
        layerRef.current;
      initialFocus?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeLayerStack.at(-1) !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onDismissRef.current();
        return;
      }
      if (event.key !== "Tab" || !trapFocus) return;
      const focusable = Array.from(
        layerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first == null || last == null) {
        event.preventDefault();
        layerRef.current?.focus();
      } else if (!layerRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = activeLayerStack.lastIndexOf(id);
      if (index >= 0) activeLayerStack.splice(index, 1);
      if (restoreFocus && previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [
    focusOnOpen,
    open,
    options.initialFocusRef,
    restoreFocus,
    trapFocus,
  ]);

  return layerRef;
}

export function usePopoverLifecycle<
  ContainerType extends HTMLElement,
  PopupType extends HTMLElement,
>(options: {
  open: boolean;
  onDismiss: () => void;
}): {
  containerRef: RefObject<ContainerType | null>;
  popupRef: RefObject<PopupType | null>;
} {
  const containerRef = useRef<ContainerType>(null);
  const onDismissRef = useRef(options.onDismiss);
  onDismissRef.current = options.onDismiss;
  const popupRef = useDismissibleLayer<PopupType>({
    open: options.open,
    onDismiss: options.onDismiss,
    initialFocusRef: null,
    focusOnOpen: null,
    restoreFocus: null,
    trapFocus: null,
  });

  useEffect(() => {
    if (!options.open) return;
    const dismissOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onDismissRef.current();
      }
    };
    document.addEventListener("mousedown", dismissOutside);
    return () => document.removeEventListener("mousedown", dismissOutside);
  }, [options.open]);

  return { containerRef, popupRef };
}

export function useModalLifecycle<ElementType extends HTMLElement>(
  onDismiss: () => void,
  initialFocusRef: RefObject<HTMLElement | null> | null,
): RefObject<ElementType | null> {
  return useDismissibleLayer<ElementType>({
    onDismiss,
    initialFocusRef,
    trapFocus: true,
    open: null,
    focusOnOpen: null,
    restoreFocus: null,
  });
}
