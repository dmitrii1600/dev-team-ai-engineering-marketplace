import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, test } from "vitest";
import { Header } from "../../src/components/Header";
import { CatalogProvider } from "../../src/context/catalog";
import { UiProvider } from "../../src/context/ui";
import { Search } from "../../src/pages/Search";
import { fixtureCatalog } from "../fixtures/catalog";

function Probe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
}

const renderSearch = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <CatalogProvider initial={fixtureCatalog()}>
        <UiProvider>
          <Header />
          <Routes>
            <Route path="/search" element={<Search />} />
          </Routes>
          <Probe />
        </UiProvider>
      </CatalogProvider>
    </MemoryRouter>,
  );

const location = () => screen.getByTestId("location").textContent;
const cardTitles = () => [...document.querySelectorAll(".card-title")].map((el) => el.textContent);

describe("search page URL state", () => {
  test("restores query, filters and sort from the URL", () => {
    renderSearch("/search?q=review&type=agent&kw=git&sort=name");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Results for “review”");
    expect(cardTitles()).toEqual(["code-reviewer"]);
    expect(screen.getByRole("button", { name: /^agents/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "git" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox")).toHaveValue("name"); // the sort select
    expect(screen.getByRole("textbox", { name: "Search the catalog" })).toHaveValue("review");
    expect(screen.getByText("1 artifact")).toBeInTheDocument();
  });

  test("with an empty query it browses everything", () => {
    renderSearch("/search");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Browse the catalog");
    expect(screen.getByText("8 artifacts")).toBeInTheDocument();
  });

  test("clicking facets and the sort writes them to the URL", async () => {
    const user = userEvent.setup();
    renderSearch("/search");
    await user.click(screen.getByRole("button", { name: /^agents/i }));
    expect(location()).toBe("/search?type=agent");
    await user.click(screen.getByRole("button", { name: /^skills/i }));
    expect(location()).toBe("/search?type=agent,skill");
    await user.click(screen.getByRole("button", { name: "review" }));
    expect(location()).toBe("/search?type=agent,skill&kw=review");
    await user.selectOptions(screen.getByRole("combobox"), "name");
    expect(location()).toBe("/search?type=agent,skill&kw=review&sort=name");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(location()).toBe("/search?sort=name"); // sort is not a filter
  });

  test("typing in the header searches live (debounced) and replaces the URL", async () => {
    const user = userEvent.setup();
    renderSearch("/search");
    await user.type(screen.getByRole("textbox", { name: "Search the catalog" }), "commit");
    await waitFor(() => expect(location()).toBe("/search?q=commit"));
    expect(cardTitles()[0]).toBe("commit-message");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Results for “commit”");
  });

  test("shows the nothing-found state with Reset filters and Request a skill", async () => {
    const user = userEvent.setup();
    renderSearch("/search?q=zzzz&type=agent");
    expect(screen.getByRole("heading", { name: "Nothing found" })).toBeInTheDocument();
    expect(screen.getByText("0 artifacts")).toBeInTheDocument();
    const request = screen.getByRole("link", { name: "Request a skill" });
    expect(request).toHaveAttribute("href", "https://github.com/acme/market/issues/new?template=skill-request.yml&title=%5BSkill%20request%5D%20zzzz");

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(location()).toBe("/search");
    expect(screen.getByText("8 artifacts")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search the catalog" })).toHaveValue("");
  });

  test("plugin= and category= show as removable chips", async () => {
    const user = userEvent.setup();
    renderSearch("/search?plugin=beta-tools");
    expect(cardTitles()).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Remove filter plugin: beta-tools" }));
    expect(location()).toBe("/search");
    expect(cardTitles()).toHaveLength(8);
  });

  test("the result count is a polite live region", () => {
    renderSearch("/search?q=commit");
    const count = screen.getByText(/artifacts?$/);
    expect(count).toHaveAttribute("aria-live", "polite");
  });

  test("facet counters follow the current results", () => {
    renderSearch("/search?q=commit");
    const types = within(document.querySelector(".facet-list") as HTMLElement);
    expect(types.getByRole("button", { name: /^skills/i })).toHaveTextContent("1");
    expect(types.getByRole("button", { name: /^hooks/i })).toHaveTextContent("0");
  });
});

test("the header field on another page opens the search with the query", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <CatalogProvider initial={fixtureCatalog()}>
        <UiProvider>
          <Header />
          <Routes>
            <Route path="/search" element={<Search />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
          <Probe />
        </UiProvider>
      </CatalogProvider>
    </MemoryRouter>,
  );
  await user.type(screen.getByRole("textbox", { name: "Search the catalog" }), "deploy{Enter}");
  expect(location()).toBe("/search?q=deploy");
  expect(cardTitles()).toContain("deploy");
});
