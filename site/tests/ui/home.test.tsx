import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import { CatalogProvider } from "../../src/context/catalog";
import type { Catalog } from "../../src/lib/catalog";
import { Home } from "../../src/pages/Home";
import { emptyCatalog, fixtureCatalog, singlePluginCatalog } from "../fixtures/catalog";

const renderHome = (catalog: Catalog) =>
  render(
    <MemoryRouter>
      <CatalogProvider initial={catalog}>
        <Home />
      </CatalogProvider>
    </MemoryRouter>,
  );

// [count, label] of the five tiles, in order.
const tiles = (container: HTMLElement) =>
  [...container.querySelectorAll(".stat")].map((tile) => [
    tile.querySelector(".stat-count")?.textContent,
    tile.querySelector(".stat-label")?.textContent,
  ]);

describe("Home stats tiles", () => {
  test("use the singular form for 1 and the plural form for other counts", () => {
    const { container } = renderHome(fixtureCatalog());
    expect(tiles(container)).toEqual([
      ["2", "plugins"],
      ["3", "skills"],
      ["1", "agent"],
      ["1", "command"],
      ["0", "MCP"],
    ]);
  });

  test("agree with the count when everything is 1 or 0", () => {
    const { container } = renderHome(singlePluginCatalog());
    expect(tiles(container)).toEqual([
      ["1", "plugin"],
      ["1", "skill"],
      ["1", "agent"],
      ["0", "commands"],
      ["0", "MCP"],
    ]);
  });

  test("mutes the tiles that are zero and links each tile to a filtered search", () => {
    const { container } = renderHome(singlePluginCatalog());
    const all = [...container.querySelectorAll<HTMLAnchorElement>(".stat")];
    expect(all.map((a) => a.classList.contains("is-zero"))).toEqual([false, false, false, true, true]);
    expect(all[1].getAttribute("href")).toBe("/search?type=skill");
    expect(all[4].getAttribute("href")).toBe("/search?type=mcp");
  });

  test("shows the latest release and the short build id", () => {
    renderHome(fixtureCatalog());
    expect(screen.getByText("Latest release: 2026-10-10 · build abcdef1")).toBeInTheDocument();
  });
});

describe("Home sections", () => {
  test("lists tag chips and the latest releases, newest first", () => {
    const { container } = renderHome(fixtureCatalog());
    const chips = [...container.querySelectorAll(".chip-row a")].map((a) => a.textContent);
    expect(chips[0]).toBe("#git"); // used by both plugins
    const rows = [...container.querySelectorAll(".release-row")];
    expect(rows[0]).toHaveTextContent("Beta Tools");
    expect(rows[0]).toHaveTextContent("v1.1.0");
  });

  test("the onboarding banner can be dismissed and stays dismissed", async () => {
    const user = userEvent.setup();
    const first = renderHome(fixtureCatalog());
    expect(screen.getByText("First time here?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss this banner" }));
    expect(screen.queryByText("First time here?")).not.toBeInTheDocument();
    first.unmount();

    renderHome(fixtureCatalog());
    expect(screen.queryByText("First time here?")).not.toBeInTheDocument();
  });

  test("shows the empty-catalog state instead of the stats", () => {
    const { container } = renderHome(emptyCatalog());
    expect(screen.getByRole("heading", { name: "The catalog is empty" })).toBeInTheDocument();
    expect(container.querySelector(".stats")).toBeNull();
    const actions = within(container.querySelector(".actions") as HTMLElement);
    expect(actions.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/getting-started");
  });
});
