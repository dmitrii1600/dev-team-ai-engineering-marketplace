// All user-visible copy lives in en.json. `t()` is typed from that file, so a missing key is a
// compile error (`npm run typecheck`).
//
//   plain string    "Back to the catalog"            t("notFound.home")
//   {placeholder}   "Open {name}"                    t("common.openName", { name })
//   plural object   { "one": "...", "other": "..." } t("search.count", { count: 3 })  (needs `count`)
import en from "./en.json";

type Messages = typeof en;
export type MessageKey = keyof Messages;
export type PluralKey = { [K in MessageKey]: Messages[K] extends string ? never : K }[MessageKey];
export type PlainKey = Exclude<MessageKey, PluralKey>;
export type Params = Record<string, string | number>;
export type PluralParams = Params & { count: number };

export const messages: Readonly<Record<string, string | Record<string, string>>> = en;

const pluralRules = new Intl.PluralRules("en");

/** Replaces `{name}` with params[name]; an unknown placeholder is left as it is. */
export const interpolate = (template: string, params: Params = {}): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));

export const resolveTemplate = (key: MessageKey, params: Params = {}): string => {
  const entry = messages[key];
  if (typeof entry === "string") return entry;
  const count = Number(params.count);
  const form = pluralRules.select(Number.isFinite(count) ? count : 0);
  return entry?.[form] ?? entry?.other ?? key;
};

export function t(key: PlainKey, params?: Params): string;
export function t(key: PluralKey, params: PluralParams): string;
export function t(key: MessageKey, params: Params = {}): string {
  return interpolate(resolveTemplate(key, params), params);
}
