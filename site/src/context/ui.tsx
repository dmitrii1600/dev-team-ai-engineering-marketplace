// UI state shared by the header, the hotkeys and the command palette.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface UiContextValue {
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  const value = useMemo(
    () => ({ paletteOpen, openPalette, closePalette, togglePalette }),
    [paletteOpen, openPalette, closePalette, togglePalette],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export const useUi = (): UiContextValue => {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
};
