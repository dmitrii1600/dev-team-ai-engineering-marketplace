import type { CSSProperties } from "react";

interface Props {
  html: string;
  as?: "div" | "span" | "li";
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders HTML that was produced and sanitized at build time (scripts/lib/markdown.mjs: no raw HTML,
 * no scripts, no event handlers, no images). It is the only place that injects markup.
 */
export function Html({ html, as: Tag = "div", className, style }: Props) {
  return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
