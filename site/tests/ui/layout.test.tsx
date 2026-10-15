import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, test } from "vitest";
import { Layout } from "../../src/components/Layout";
import { CatalogProvider } from "../../src/context/catalog";
import { ToastProvider } from "../../src/context/toast";
import { UiProvider } from "../../src/context/ui";
import { fixtureCatalog } from "../fixtures/catalog";

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <CatalogProvider initial={fixtureCatalog()}>
        <ToastProvider>
          <UiProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="*" element={<Where />} />
              </Route>
            </Routes>
          </UiProvider>
        </ToastProvider>
      </CatalogProvider>
    </MemoryRouter>,
  );

describe("command palette", () => {
  test("Ctrl+K opens it, Tab stays inside, Esc closes and returns focus", async () => {
    const user = userEvent.setup();
    renderApp();
    const opener = screen.getByRole("button", { name: "Toggle light and dark theme" });
    opener.focus();

    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Jump to an artifact" });
    const input = screen.getByRole("combobox");
    expect(input).toHaveFocus();
    expect(dialog).toContainElement(input);

    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus(); // wrapped around, did not leave the dialog
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test("arrow keys move the selection and Enter opens the result", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");
    await user.keyboard("review");
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options.length).toBeLessThanOrEqual(8);

    await user.keyboard("{ArrowDown}");
    const [, second] = screen.getAllByRole("option");
    expect(second).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toMatch(/^\/plugins\//);
  });

  test("shows a message when nothing matches", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");
    await user.keyboard("zzzz");
    expect(await screen.findByText("Nothing found")).toBeInTheDocument();
  });
});

describe("header", () => {
  test("the / key focuses the search field", async () => {
    const user = userEvent.setup();
    renderApp();
    // jsdom has no layout, so the field counts as "visible" only if getClientRects is stubbed.
    const field = screen.getByRole("textbox", { name: "Search the catalog" });
    field.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList;
    await user.keyboard("/");
    expect(field).toHaveFocus();
  });

  test("the theme toggle switches dark and light and remembers the choice", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = "dark";
    renderApp();
    const toggle = screen.getByRole("button", { name: "Toggle light and dark theme" });
    expect(toggle).toHaveTextContent("☾");
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(toggle).toHaveTextContent("☀");
    expect(window.localStorage.getItem("theme")).toBe("light");
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});
