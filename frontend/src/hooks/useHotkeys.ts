import { useEffect, useCallback, type DependencyList } from "react";

type KeyMap = Record<string, () => void>;

/**
 * Normalise a key descriptor, e.g. "ctrl+n" → "ctrl+n".
 * Supports Ctrl / Meta / Alt / Shift modifiers + a single key.
 */
function parseKey(descriptor: string) {
  const parts = descriptor.toLowerCase().split("+");
  return {
    ctrl: parts.includes("ctrl") || parts.includes("meta") || parts.includes("⌘"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    key: parts[parts.length - 1],
  };
}

/**
 * Global hotkey hook.
 *
 * Usage:
 * ```ts
 * useHotkeys({
 *   n: () => navigate("/projects/new"),
 *   g: () => setView("grid"),
 *   escape: () => setSelected(null),
 *   "ctrl+s": () => save(),
 * });
 * ```
 *
 * Ignores events when focused on input, textarea, select, or contenteditable elements.
 */
export function useHotkeys(keyMap: KeyMap, deps: DependencyList = []) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const [descriptor, action] of Object.entries(keyMap)) {
        const parsed = parseKey(descriptor);

        const keyMatches = e.key.toLowerCase() === parsed.key;
        const ctrlMatches = parsed.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
        const altMatches = parsed.alt ? e.altKey : !e.altKey;
        const shiftMatches = parsed.shift ? e.shiftKey : !e.shiftKey;

        if (keyMatches && ctrlMatches && altMatches && shiftMatches) {
          e.preventDefault();
          action();
          return;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handler]);
}
