import type { Catalog } from "./catalog";

/** Where catalog.json is published: next to the app, under the Vite base path. */
export const catalogUrl = (): string => `${import.meta.env.BASE_URL}catalog.json`;

export const loadCatalog = async (url: string = catalogUrl(), fetchImpl: typeof fetch = fetch): Promise<Catalog> => {
  const res = await fetchImpl(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (typeof data !== "object" || data === null || (data as { schemaVersion?: unknown }).schemaVersion !== 1)
    throw new Error("Unsupported catalog format");
  return data as Catalog;
};
