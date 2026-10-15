#!/usr/bin/env node
// Builds the data files of the site from the marketplace sources.
//
//   node site/scripts/build-catalog.mjs            build, validate, write public/catalog.json, public/feed.xml
//                                                  and public/catalog.schema.json
//   node site/scripts/build-catalog.mjs --check    build in memory, validate, check README/config
//                                                  consistency; writes nothing (used by CI)
//
// Options:
//   --root <dir>   repository root to read. Falls back to the CATALOG_ROOT environment variable,
//                  then to the repository that contains site/.
//   --out <file>   path of catalog.json (default site/public/catalog.json); feed.xml and
//                  catalog.schema.json are written next to it.
//   --config <file>  site.config.json
// Problems are printed as `::error::` lines (GitHub annotations) and the exit code is 1.
// Nothing is written unless the whole build is valid, so a failed rebuild keeps the last good files.
import Ajv2020 from "ajv/dist/2020.js";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, checkOnboarding } from "./lib/catalog.mjs";
import { buildFeed } from "./lib/feed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = resolve(HERE, "..");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const ROOT = resolve(option("--root") ?? process.env.CATALOG_ROOT ?? join(SITE_DIR, ".."));
const OUT = resolve(option("--out") ?? join(SITE_DIR, "public", "catalog.json"));
const CONFIG = resolve(option("--config") ?? join(SITE_DIR, "site.config.json"));
const SCHEMA = join(SITE_DIR, "schema", "catalog.schema.json");
const CHECK = flag("--check");

const errors = [];
const warnings = [];

const gitCommit = () => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "local";
  }
};

const loadJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    errors.push(`${label}: cannot read ${path} (${e.message})`);
    return null;
  }
};

const finish = (code) => {
  for (const w of warnings) console.warn(`::warning::${w}`);
  for (const e of errors) console.error(`::error::${e}`);
  if (errors.length) console.error(`\n${errors.length} problem(s) found.`);
  process.exit(code);
};

const config = loadJson(CONFIG, "site.config.json");
const schema = loadJson(SCHEMA, "catalog.schema.json");
if (!config || !schema) finish(1);
for (const key of ["repo", "marketplaceName", "minClaudeCodeVersion", "siteUrl", "basePath"])
  if (typeof config[key] !== "string" || !config[key]) errors.push(`site.config.json: "${key}" is required`);
if (errors.length) finish(1);

const built = buildCatalog({ root: ROOT, config, commit: gitCommit() });
const { catalog } = built;
errors.push(...built.errors);
warnings.push(...built.warnings);

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
if (!validate(catalog)) {
  for (const e of validate.errors)
    errors.push(`catalog.json does not match catalog.schema.json: ${e.instancePath || "/"} ${e.message}`);
}

const readmePath = join(ROOT, "README.md");
errors.push(
  ...checkOnboarding({
    readme: existsSync(readmePath) ? readFileSync(readmePath, "utf8") : null,
    catalog,
    config,
  }),
);

if (errors.length) finish(1);

const summary = `${catalog.plugins.length} plugin(s), ${catalog.artifacts.length} artifact(s)`;
if (CHECK) {
  console.log(`Catalog check passed: ${summary}.`);
} else {
  const outDir = dirname(OUT);
  mkdirSync(outDir, { recursive: true });
  // Write to a temporary file first, so a reader (the dev server) never sees half a file.
  const write = (file, content) => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, file);
  };
  write(OUT, `${JSON.stringify(catalog, null, 2)}\n`);
  write(join(outDir, "feed.xml"), buildFeed(catalog, config));
  write(join(outDir, "catalog.schema.json"), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`Wrote catalog.json, feed.xml and catalog.schema.json to ${outDir} (${summary}).`);
}
finish(0);
