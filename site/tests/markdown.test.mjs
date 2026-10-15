import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightJson, inlineCode, renderInlineMarkdown, renderJsonBlock, renderMarkdown } from "../scripts/lib/markdown.mjs";

const ctx = { repoBlobUrl: "https://github.com/acme/market/blob/main", dir: "plugins/demo/skills/x" };

test("sanitizes raw HTML, scripts, event handlers, javascript: links and images", () => {
  const html = renderMarkdown(
    [
      "<script>alert(1)</script>",
      "",
      '<img src="https://tracker.example/p.png" onerror="alert(1)">',
      "",
      "[bad](javascript:alert(1)) and ![pic](https://example.com/a.png)",
      "",
      '<a href="https://example.com" onclick="alert(1)">raw</a>',
    ].join("\n"),
    ctx,
  );
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror|onclick/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<img/i);
});

test("shifts headings down two levels and renders GFM tables", () => {
  const html = renderMarkdown("# One\n\n## Two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n", ctx);
  assert.match(html, /<h3>One<\/h3>/);
  assert.match(html, /<h4>Two<\/h4>/);
  assert.match(html, /<table>/);
});

test("rewrites relative links to the file on GitHub and marks external links", () => {
  const html = renderMarkdown("[a](../other.md) [b](/docs/x.md) [c](#anchor) [d](https://example.com)", ctx);
  assert.match(html, /href="https:\/\/github\.com\/acme\/market\/blob\/main\/plugins\/demo\/skills\/other\.md"/);
  assert.match(html, /href="https:\/\/github\.com\/acme\/market\/blob\/main\/docs\/x\.md"/);
  assert.match(html, /href="#anchor"/);
  assert.match(html, /href="https:\/\/example\.com" rel="noopener noreferrer"/);
});

test("inline markdown drops the wrapping paragraph", () => {
  assert.equal(renderInlineMarkdown("Skill `commit-message`: **bold**", ctx), "Skill <code>commit-message</code>: <strong>bold</strong>");
  assert.doesNotMatch(renderInlineMarkdown("<script>x</script> text", ctx), /<script/);
});

test("inlineCode escapes text and turns code spans into <code>", () => {
  assert.equal(inlineCode("a <b> & `c`"), "a &lt;b&gt; &amp; <code>c</code>");
});

test("highlightJson escapes first and marks keys, strings, numbers and literals", () => {
  const html = highlightJson('{"a": "<x>", "n": 1, "ok": true}');
  assert.match(html, /<span class="tok-key">"a"<\/span>:/);
  assert.match(html, /<span class="tok-str">"&lt;x&gt;"<\/span>/);
  assert.match(html, /<span class="tok-num">1<\/span>/);
  assert.match(html, /<span class="tok-lit">true<\/span>/);
  assert.doesNotMatch(html, /<x>/);
  assert.match(renderJsonBlock("{}"), /^<pre class="code-block"><code>/);
});
