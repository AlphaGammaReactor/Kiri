/**
 * HotkeyHint — small inline badge showing a keyboard shortcut.
 * Renders as a <kbd> element styled with the Kiri design tokens.
 *
 * Usage: <HotkeyHint keys="⌘N" /> or <HotkeyHint keys="G" />
 */
export function HotkeyHint({ keys, className = "" }: { keys: string; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-mono font-medium rounded border border-kiri-border bg-kiri-bg text-kiri-text-dim leading-none select-none ${className}`}
    >
      {keys}
    </kbd>
  );
}
