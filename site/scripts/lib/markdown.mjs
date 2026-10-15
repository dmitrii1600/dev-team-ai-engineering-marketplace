// Markdown -> sanitized HTML, run at build time only (the browser bundle ships no markdown parser).
// Artifact content arrives through pull requests, so it is untrusted:
//  - raw HTML in markdown is dropped (no rehype-raw),
//  - rehype-sanitize (GitHub-style schema) strips scripts, on* handlers and javascript: URLs,
//  - <img> is removed so no third-party image can be requested,
//  - relative links are rewritten to the file on GitHub.
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const rehypeRewriteLinks = (ctx) => () => (tree) => {
  visit(tree, "element", (node) => {
    if (node.tagName !== "a") return;
    const href = node.properties?.href;
    if (typeof href !== "string" || href === "" || href.startsWith("#") || href.startsWith("//") || SCHEME.test(href))
      return;
    try {
      node.properties.href = href.startsWith("/")
        ? `${ctx.repoBlobUrl}/${href.slice(1)}`
        : new URL(href, `${ctx.repoBlobUrl}/${ctx.dir ? `${ctx.dir}/` : ""}`).href;
    } catch {
      delete node.properties.href;
    }
  });
};

// The page already has an h1/h2; document headings start at h3.
const rehypeShiftHeadings = (by) => () => (tree) => {
  visit(tree, "element", (node) => {
    const m = /^h([1-6])$/.exec(node.tagName);
    if (m) node.tagName = `h${Math.min(6, Number(m[1]) + by)}`;
  });
};

const rehypeExternalLinks = () => (tree) => {
  visit(tree, "element", (node) => {
    const href = node.properties?.href;
    if (node.tagName === "a" && typeof href === "string" && /^https?:/i.test(href))
      node.properties.rel = ["noopener", "noreferrer"];
  });
};

const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => t !== "img"),
};

/**
 * @param {string} source markdown
 * @param {{ repoBlobUrl: string, dir?: string }} ctx
 *   repoBlobUrl: https://github.com/<owner>/<repo>/blob/<branch>
 *   dir: directory of the markdown file inside the repository, for relative links
 * @returns {string} sanitized HTML
 */
export const renderMarkdown = (source, ctx) =>
  String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeRewriteLinks({ dir: "", ...ctx }))
      .use(rehypeShiftHeadings(2))
      .use(rehypeSanitize, schema)
      .use(rehypeExternalLinks)
      .use(rehypeStringify)
      .processSync(source),
  );

// A single line of markdown (a CHANGELOG bullet) as inline HTML: the wrapping <p> is removed.
export const renderInlineMarkdown = (source, ctx) => {
  const html = renderMarkdown(source, ctx).trim();
  const m = /^<p>([\s\S]*)<\/p>$/.exec(html);
  return m && !m[1].includes("<p>") ? m[1] : html;
};

export const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Escapes text and turns `code` spans into <code>. Used for one-line summaries, which sit inside
// links on cards, so they must not contain anchors of their own.
export const inlineCode = (s) => escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");

// Minimal JSON highlighter for hook / MCP fragments. Input is escaped first, so the output is safe HTML.
export const highlightJson = (json) => {
  const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (_m, str, colon, lit, num) => {
      if (str !== undefined) return colon ? `<span class="tok-key">${str}</span>${colon}` : `<span class="tok-str">${str}</span>`;
      if (lit !== undefined) return `<span class="tok-lit">${lit}</span>`;
      return `<span class="tok-num">${num}</span>`;
    },
  );
};

// HTML for the "Documentation" panel of a hook / MCP artifact.
export const renderJsonBlock = (json) => `<pre class="code-block"><code>${highlightJson(json)}</code></pre>`;
