import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useCatalogState } from "../context/catalog";
import { useUi } from "../context/ui";
import { t } from "../i18n";
import type { Entry } from "../lib/catalog";
import { searchEngineFor } from "../lib/search";

const MAX_RESULTS = 8;

/** Ctrl/⌘+K command palette: quick jump to a plugin or an artifact. Same index as the search page, no filters. */
export function Palette() {
  const { paletteOpen, closePalette } = useUi();
  return paletteOpen ? <PaletteDialog onClose={closePalette} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const { state } = useCatalogState();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    inputRef.current?.focus();
    const previous = opener.current;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const items = useMemo((): Entry[] | null => {
    if (state.status !== "ready") return null;
    const engine = searchEngineFor(state.catalog);
    if (!query.trim()) return engine.entries.slice(0, MAX_RESULTS);
    // The scores map keeps the order of the hits, best first.
    return [...engine.search(query).scores.keys()]
      .slice(0, MAX_RESULTS)
      .map((id) => engine.byId.get(id))
      .filter((e): e is Entry => e !== undefined);
  }, [state, query]);

  const activeIndex = items && items.length > 0 ? Math.min(active, items.length - 1) : 0;
  const activeId = items && items.length > 0 ? `palette-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const move = (delta: number) => {
    if (!items || items.length === 0) return;
    setActive((activeIndex + delta + items.length) % items.length);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = items?.[activeIndex];
      if (entry) {
        onClose();
        void navigate(entry.to);
      }
    }
  };

  // Escape closes; Tab cycles between the input and the close button only (focus trap).
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("input, button") ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  const message =
    state.status === "loading"
      ? t("palette.loading")
      : state.status === "error"
        ? t("palette.unavailable")
        : items?.length === 0
          ? t("palette.empty")
          : null;

  return (
    <div
      className="palette-overlay"
      id="palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(); // click on the overlay
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.label")}
        ref={dialogRef}
        onKeyDown={onDialogKeyDown}
      >
        <div className="palette-bar">
          <span className="search-glyph" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            className="palette-input"
            id="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label={t("palette.label")}
            placeholder={t("palette.placeholder")}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
          />
          <button type="button" className="palette-esc" onClick={onClose} aria-label={t("palette.close")}>
            {t("palette.esc")}
          </button>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" aria-label={t("palette.results")}>
          {message ? <div className="palette-empty">{message}</div> : null}
          {items?.map((entry, i) => (
            <Link
              key={entry.id}
              id={`palette-option-${i}`}
              to={entry.to}
              className={`palette-item k-${entry.kind}`}
              role="option"
              aria-selected={i === activeIndex}
              onClick={onClose}
              onMouseMove={() => i !== activeIndex && setActive(i)}
            >
              <span className="dot" aria-hidden="true"></span>
              <span className="text">
                <span className="name">{entry.displayName}</span>
                <span className="meta"> · {entry.kind === "plugin" ? t("palette.plugin") : entry.plugin}</span>
              </span>
              <span className="type">{t(`kind.singular.${entry.kind}`)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
