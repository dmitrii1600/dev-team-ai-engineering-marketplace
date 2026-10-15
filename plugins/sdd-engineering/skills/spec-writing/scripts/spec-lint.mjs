#!/usr/bin/env node
/**
 * spec-lint — structural checks for a feature spec written to the template of the
 * `sdd-engineering:spec-writing` skill (references/spec-template.md, references/lifecycle.md).
 *
 * No dependencies beyond Node >= 22. Read-only: it never writes anything. Two ways in:
 *
 *   node "${CLAUDE_SKILL_DIR}/scripts/spec-lint.mjs" <spec.md> [<spec.md> …]
 *       Prints one line per finding, exits 1 when any finding is CRITICAL, 2 on a usage
 *       error or an unreadable file, 0 otherwise.
 *
 *   import { lintSpec, isSpecFile } from '<this file>'
 *       `lintSpec(text, path)` returns findings; a project's own gate can call it for every
 *       changed spec so a malformed spec cannot reach a pull request.
 *
 * Any path is accepted; the spec folder is the project's choice (`specsDir`, default
 * `specs/`). On the command line a file without a `Spec ID:` line is a CRITICAL finding —
 * you asked for it to be linted. Through `lintSpec(text, path)` without
 * `{ requireId: true }` such a file is skipped, so a caller can pass every markdown file
 * under the spec folder and leave older, pre-template documents alone.
 *
 * Every finding is `{ rule, severity, line, summary, evidence, fix }` with severity
 * CRITICAL (identity and lifecycle fields) or WARNING (template completeness, EARS form,
 * traceability).
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_HEADINGS = [
  '## Problem and user',
  '## Goals / Non-goals',
  '## User stories',
  '## Acceptance criteria (EARS)',
  '## Edge cases',
  '## Design review',
  '## Non-functional requirements',
  '## Traceability',
  '## Inputs and provenance',
  '## Untrusted inputs',
  '## Open questions',
];

export const STATUSES = new Set(['draft', 'approved', 'implemented']);
export const VERIFY_LANES = new Set(['unit', 'component', 'integration', 'e2e', 'static', 'manual']);
const WEAK_WORDS = /\b(should|quickly|user-friendly|as appropriate|properly|robust|intuitive|seamless)\b/i;
const FILENAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/**
 * A spec file is a markdown file directly under the spec folder (`specsDir`, default
 * `specs`) that is not a README. `specsDir` may be nested (`docs/specs`).
 */
export function isSpecFile(relPath, specsDir = 'specs') {
  const p = relPath.replace(/\\/g, '/');
  const dir = specsDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|/)${escaped}/[^/]+\\.md$`).test(p) && !/(^|\/)README\.md$/i.test(p);
}

function f(rule, severity, line, summary, evidence, fix) {
  return { rule, severity, line, summary, evidence, fix };
}

/**
 * Collect `- **XX-n** …` items; an item runs until the next item, a heading or a blank line.
 * The bold label may carry a tag before its closing `**` — the template writes open
 * questions as `- **Q-n (non-blocking):** …` — and the tag is kept at the front of `text`.
 * Open questions also come as `- Q-n, resolved: …` once the person has answered them
 * (references/lifecycle.md, *Resolved decisions*); those carry `resolved: true`.
 */
function items(lines, prefix) {
  const out = [];
  const re = new RegExp(`^- \\*\\*${prefix}-(\\d+)((?:\\s*\\([^)]*\\))?:?)\\*\\*:?\\s*(.*)$`);
  const resolvedRe = prefix === 'Q' ? /^- Q-(\d+),\s*resolved:\s*(.*)$/ : null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    const r = m ? null : resolvedRe && lines[i].match(resolvedRe);
    if (!m && !r) continue;
    let text = m ? `${m[2].trim()} ${m[3]}`.trim() : r[2];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '' && !/^(- |#)/.test(lines[j])) {
      text += ' ' + lines[j].trim();
      j++;
    }
    const n = m ? m[1] : r[1];
    out.push({ id: `${prefix}-${n}`, n: Number(n), line: i + 1, text, resolved: !m });
  }
  return out;
}

function sectionBody(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

export function lintSpec(text, relPath, { requireId = false } = {}) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const idLine = lines.findIndex((l) => /^Spec ID:/.test(l));
  if (idLine < 0) {
    if (requireId) {
      out.push(
        f('spec-id', 'CRITICAL', 0, 'No `Spec ID:` line — not written to the spec template', '(missing)',
          'Start the file with `# Spec: <feature>`, then `Spec ID: SPEC-<filename stem>`, `Status: draft`, `Supersedes: none`.'),
      );
    }
    return out; // not a template spec — nothing else to check
  }

  const base = basename(relPath.replace(/\\/g, '/'));
  const stem = base.replace(/\.md$/, '');

  // --- identity ---------------------------------------------------------------
  if (!FILENAME.test(base)) {
    out.push(
      f('spec-name', 'CRITICAL', 0, 'Spec file is not named `YYYY-MM-DD-short-name.md`', base,
        'Date the spec was started plus two to four lowercase words naming the feature (spec-writing, references/lifecycle.md).'),
    );
  }
  const id = lines[idLine].replace(/^Spec ID:\s*/, '').trim();
  if (id !== `SPEC-${stem}`) {
    out.push(
      f('spec-id', 'CRITICAL', idLine + 1, 'Spec ID does not match the filename stem', `${id} vs SPEC-${stem}`,
        'The ID is the filename without `.md`, prefixed `SPEC-`, so one glob finds the file.'),
    );
  }
  const statusLine = lines.findIndex((l) => /^Status:/.test(l));
  const status = statusLine < 0 ? '' : lines[statusLine].replace(/^Status:\s*/, '').trim();
  if (!STATUSES.has(status)) {
    out.push(
      f('spec-status', 'CRITICAL', Math.max(statusLine + 1, 0), 'Status is not one of draft | approved | implemented',
        status || '(missing)', 'A person moves it draft → approved → implemented; the agent only ever writes draft.'),
    );
  }
  const supersedes = lines.findIndex((l) => /^Supersedes:/.test(l));
  if (supersedes < 0) {
    out.push(f('spec-supersedes', 'WARNING', 0, 'No `Supersedes:` line', '(missing)', 'Write `Supersedes: none` when there is nothing to supersede.'));
  } else {
    const v = lines[supersedes].replace(/^Supersedes:\s*/, '').trim();
    if (v !== 'none' && !/^SPEC-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(v)) {
      out.push(f('spec-supersedes', 'WARNING', supersedes + 1, 'Supersedes is neither `none` nor a Spec ID', v, 'Point at the superseded spec by its full `SPEC-YYYY-MM-DD-name` ID.'));
    }
  }

  // --- template completeness ----------------------------------------------------
  let lastIdx = -1;
  for (const h of REQUIRED_HEADINGS) {
    const idx = lines.findIndex((l) => l.trim() === h);
    if (idx < 0) {
      out.push(f('spec-template', 'WARNING', 0, `Missing section \`${h}\``, '(absent)', 'Every heading stays, even when its body is one line (spec-writing, references/spec-template.md).'));
      continue;
    }
    if (idx < lastIdx) {
      out.push(f('spec-template', 'WARNING', idx + 1, `Section \`${h}\` is out of template order`, h, 'Keep the sections in the order of the template so ledgers and readers find them.'));
    }
    lastIdx = Math.max(lastIdx, idx);
  }

  // --- EARS items ---------------------------------------------------------------
  const ac = items(lines, 'AC');
  const ec = items(lines, 'EC');
  const nfr = items(lines, 'NFR');
  const us = items(lines, 'US');
  const dr = items(lines, 'DR');
  const q = items(lines, 'Q');

  if (ac.length === 0) out.push(f('spec-ears', 'WARNING', 0, 'No `- **AC-n**` acceptance criteria found', '(none)', 'Write each criterion as `- **AC-n** <EARS sentence> · traces: … · verify: …`.'));

  for (const it of [...ac, ...ec]) {
    if (!/\bshall\b/.test(it.text)) {
      out.push(f('spec-ears', 'WARNING', it.line, `${it.id} does not use \`shall\``, it.text.slice(0, 80), 'Every EARS criterion carries `shall`; one pattern, one behaviour.'));
    }
    const patterns = [/^WHEN\b/, /^WHILE\b/, /^IF\b[\s\S]*\bTHEN\b/, /^WHERE\b/, /shall/];
    if (!patterns.some((re) => re.test(it.text))) {
      out.push(f('spec-ears', 'WARNING', it.line, `${it.id} matches no EARS pattern`, it.text.slice(0, 80), 'Ubiquitous / WHEN / WHILE / IF…THEN / WHERE — see the spec-writing skill.'));
    }
    const weak = it.text.match(WEAK_WORDS);
    if (weak) {
      out.push(f('spec-ears', 'WARNING', it.line, `${it.id} contains an uncheckable word`, weak[0], 'Replace with an observable condition or a number.'));
    }
  }
  for (const it of [...ac, ...ec, ...nfr]) {
    if ((it.id.startsWith('AC') || it.id.startsWith('EC')) && !/traces:\s*\S/.test(it.text)) {
      out.push(f('spec-trace', 'WARNING', it.line, `${it.id} has no \`traces:\` hint`, it.text.slice(0, 80), 'Name the US-n or DR-n it satisfies.'));
    }
    const v = it.text.match(/verify:\s*([a-z0-9]+)/);
    if (!v) {
      out.push(f('spec-verify', 'WARNING', it.line, `${it.id} has no \`verify:\` hint`, it.text.slice(0, 80), `One of ${[...VERIFY_LANES].join(' | ')}.`));
    } else if (!VERIFY_LANES.has(v[1])) {
      out.push(f('spec-verify', 'WARNING', it.line, `${it.id} verify lane \`${v[1]}\` is not in the vocabulary`, v[1], `One of ${[...VERIFY_LANES].join(' | ')}.`));
    }
  }

  // --- dense numbering --------------------------------------------------------------
  for (const [name, list] of [['AC', ac], ['EC', ec], ['NFR', nfr], ['US', us], ['DR', dr], ['Q', q]]) {
    const ns = list.map((x) => x.n);
    for (let i = 0; i < ns.length; i++) {
      if (ns[i] !== i + 1) {
        out.push(f('spec-numbering', 'WARNING', list[i].line, `${name} numbering is not dense`, `${name}-${ns[i]} at position ${i + 1}`, `Number ${name}-1 … ${name}-n with no gaps or repeats.`));
        break;
      }
    }
  }

  // --- traceability -------------------------------------------------------------
  const trace = sectionBody(lines, '## Traceability');
  if (trace) {
    const traceText = trace.join('\n');
    const known = new Set([...ac, ...ec, ...nfr, ...us, ...dr, ...q].map((x) => x.id));
    for (const it of [...ac, ...ec, ...nfr]) {
      if (!new RegExp(`\\|\\s*${it.id}\\s*\\|`).test(traceText)) {
        out.push(f('spec-trace', 'WARNING', it.line, `${it.id} has no Traceability row`, it.id, 'One row per AC, EC and NFR: | id | traces to | verify how |.'));
      }
    }
    for (const m of traceText.matchAll(/\b(AC|EC|NFR|US|DR|Q)-(\d+)\b/g)) {
      const ref = `${m[1]}-${m[2]}`;
      if (!known.has(ref)) {
        out.push(f('spec-trace', 'WARNING', 0, `Traceability cites \`${ref}\`, which does not exist`, ref, 'Remove the reference or add the item it points at.'));
      }
    }
  }

  // --- open questions -----------------------------------------------------------
  const oq = sectionBody(lines, '## Open questions');
  if (oq && !oq.some((l) => /^- /.test(l))) {
    out.push(f('spec-open-questions', 'WARNING', 0, 'Open questions is empty', '(no bullet)', 'Write `- None outstanding for the stated scope.` when there truly are none.'));
  }
  for (const it of q) {
    if (!it.resolved && !/\((blocking|non-blocking)\)/.test(it.text)) {
      out.push(f('spec-open-questions', 'WARNING', it.line, `${it.id} does not say blocking or non-blocking`, it.text.slice(0, 80), 'Format: `- **Q-n (blocking|non-blocking):** question — who decides / default`, or `- Q-n, resolved: decision` once answered.'));
    }
  }

  return out;
}

// --- CLI ---------------------------------------------------------------------------
const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n|^ \* ?/gm, ''));
    process.exit(0);
  }
  const paths = args.filter((a) => !a.startsWith('-'));
  if (paths.length === 0) {
    console.error('usage: node "${CLAUDE_SKILL_DIR}/scripts/spec-lint.mjs" <spec.md> [<spec.md> …]');
    process.exit(2);
  }
  let critical = 0;
  let total = 0;
  let unreadable = 0;
  for (const p of paths) {
    let text;
    try {
      text = readFileSync(p, 'utf8');
    } catch (err) {
      unreadable++;
      console.error(`${p}: cannot read (${err.code ?? err.message})`);
      continue;
    }
    const findings = lintSpec(text, p, { requireId: true });
    if (findings.length === 0) {
      console.log(`${p}: OK`);
      continue;
    }
    for (const x of findings) {
      total++;
      if (x.severity === 'CRITICAL') critical++;
      console.log(`${p}:${x.line}: ${x.severity} [${x.rule}] ${x.summary} — ${x.evidence}\n    fix: ${x.fix}`);
    }
  }
  if (total) console.log(`\n${total} finding(s), ${critical} CRITICAL`);
  process.exit(unreadable ? 2 : critical ? 1 : 0);
}
