"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

export function useDialogFocus({
  active = true,
  focusKey,
  onDismiss,
  returnFocusRef,
  rootRef,
}: {
  active?: boolean;
  focusKey?: string;
  onDismiss: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return;

    const previousFocus =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);

    function onKeyDown(event: KeyboardEvent) {
      const root = rootRef.current;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab" || !root) return;

      const focusable = focusableElements(root);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        root.focus();
      } else if (!root.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [active, returnFocusRef, rootRef]);

  useEffect(() => {
    if (!active) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      (focusableElements(root)[0] ?? root).focus();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [active, focusKey, rootRef]);
}
