// Messages that contain inline markup, e.g. "<b>First time here?</b> Connect it in 30 seconds".
// The tags are only a notation inside en.json: each one is mapped to a React element by the caller.
// Text outside the tags and inside them is interpolated; nothing is parsed as HTML.
import { Fragment, type ReactNode } from "react";
import { type MessageKey, type Params, interpolate, resolveTemplate } from "./index";

export type RichRenderers = Record<string, (children: ReactNode) => ReactNode>;

const TAG = /<(\w+)>([\s\S]*?)<\/\1>/g;

export const tr = (key: MessageKey, params: Params, renderers: RichRenderers): ReactNode[] => {
  const template = resolveTemplate(key, params);
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of template.matchAll(TAG)) {
    const [whole, tag, inner] = match;
    const render = renderers[tag];
    if (match.index > last) out.push(<Fragment key={n++}>{interpolate(template.slice(last, match.index), params)}</Fragment>);
    out.push(
      render ? (
        <Fragment key={n++}>{render(interpolate(inner, params))}</Fragment>
      ) : (
        <Fragment key={n++}>{interpolate(inner, params)}</Fragment>
      ),
    );
    last = match.index + whole.length;
  }
  if (last < template.length) out.push(<Fragment key={n++}>{interpolate(template.slice(last), params)}</Fragment>);
  return out;
};
