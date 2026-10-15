import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { interpolate, messages, t } from "../../src/i18n";
import { tr } from "../../src/i18n/rich";
import { KINDS } from "../../src/lib/catalog";

describe("t()", () => {
  test("picks the singular and plural form from count", () => {
    expect(t("search.count", { count: 1 })).toBe("1 artifact");
    expect(t("search.count", { count: 0 })).toBe("0 artifacts");
    expect(t("search.count", { count: 2 })).toBe("2 artifacts");
    expect(t("search.countPartial", { count: 1 })).toBe("1 artifact · Showing partial matches");
    expect(t("stat.agent", { count: 1 })).toBe("agent");
    expect(t("stat.agent", { count: 3 })).toBe("agents");
    expect(t("stat.mcp", { count: 1 })).toBe("MCP");
    expect(t("stat.mcp", { count: 0 })).toBe("MCP");
  });

  test("interpolates {placeholders} and leaves unknown ones visible", () => {
    expect(t("common.openName", { name: "code-reviewer" })).toBe("Open code-reviewer");
    expect(t("home.categoryChip", { name: "development", count: 2 })).toBe("development · 2");
    expect(interpolate("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
  });

  test("does not treat interpolated values as markup", () => {
    const { container } = render(<>{tr("artifact.perm.model", { model: "<b>x</b>" }, { code: (c) => <code>{c}</code> })}</>);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("code")).toHaveTextContent("<b>x</b>");
  });
});

describe("en.json", () => {
  const SRC = join(import.meta.dirname, "..", "..", "src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  test("every key used through t() or tr() exists", () => {
    const used = new Set<string>();
    for (const file of files(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/\b(?:t|tr)\(\s*"([\w.]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(50);
    const missing = [...used].filter((key) => !(key in messages));
    expect(missing).toEqual([]);
  });

  test("keys built from a kind exist for every kind", () => {
    for (const kind of KINDS) {
      expect(messages).toHaveProperty([`kind.singular.${kind}`]);
      expect(messages).toHaveProperty([`kind.plural.${kind}`]);
    }
    for (const tile of ["plugin", "skill", "agent", "command", "mcp"]) expect(messages).toHaveProperty([`stat.${tile}`]);
  });

  test("plural entries define one and other", () => {
    for (const [key, value] of Object.entries(messages)) {
      if (typeof value === "string") continue;
      expect(Object.keys(value).sort(), key).toEqual(["one", "other"]);
    }
  });
});
