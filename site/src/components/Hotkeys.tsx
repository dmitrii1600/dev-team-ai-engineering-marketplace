import { useEffect } from "react";
import { useUi } from "../context/ui";

const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};

/** Global shortcuts: Ctrl/⌘+K toggles the palette, `/` focuses the header search field. */
export function Hotkeys() {
  const { paletteOpen, openPalette, togglePalette } = useUi();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePalette();
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)) {
        if (paletteOpen) return;
        event.preventDefault();
        const field = document.getElementById("site-search") as HTMLInputElement | null;
        // On narrow screens the header field is collapsed into an icon; the palette takes over.
        if (field && field.getClientRects().length > 0) {
          field.focus();
          field.select();
        } else openPalette();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, openPalette, togglePalette]);

  return null;
}
