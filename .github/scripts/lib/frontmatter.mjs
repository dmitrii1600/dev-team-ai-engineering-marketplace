// Shared helpers for repo scripts: used by .github/scripts/check-marketplace.mjs
// (validation) and site/scripts/build-catalog.mjs (catalog generation).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Frontmatter keys whose value is a comma-separated list.
export const LIST_KEYS = ["tools", "allowed-tools"];

// Split a comma-separated list on top-level commas only, so entries such as
// `Bash(git diff *)` (spaces, no commas) stay whole and a comma inside
// parentheses never splits an entry. A surrounding `[...]` is tolerated.
export const splitList = (value) => {
  if (typeof value !== "string") return [];
  const text = value.trim().replace(/^\[([\s\S]*)\]$/, "$1");
  const items = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      items.push(current);
      current = "";
    } else current += ch;
  }
  items.push(current);
  return items.map((item) => item.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
};

// Minimal frontmatter reader: top-level `key: value` pairs plus folded/literal blocks.
// Returns null when the text has no frontmatter block.
//   fields    raw string values, exactly as the validator has always seen them
//   lineCount number of lines in the whole file
//   body      the text after the closing `---`
//   lists     comma-separated keys (tools, allowed-tools) split into arrays
export const parseFrontmatter = (source) => {
  const text = source.replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(" ");
    }
    fields[kv[1]] = value.replace(/^["']|["']$/g, "");
  }
  const lists = {};
  for (const key of LIST_KEYS) if (key in fields) lists[key] = splitList(fields[key]);
  return {
    fields,
    lists,
    body: text.slice(match[0].length),
    lineCount: text.split("\n").length,
  };
};

export const readFrontmatter = (path) => parseFrontmatter(readFileSync(path, "utf8"));

// Reads and parses a JSON file. On a parse/read error it calls `onError(err)`
// and returns null; without a handler the error is thrown.
export const readJson = (path, onError) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (!onError) throw err;
    onError(err);
    return null;
  }
};

export const listDirs = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()) : [];
