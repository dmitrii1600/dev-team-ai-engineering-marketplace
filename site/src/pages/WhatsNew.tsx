import { useState } from "react";
import { Link } from "react-router";
import { Html } from "../components/Html";
import { useCatalog } from "../context/catalog";
import { t } from "../i18n";
import { getReleases, pluginPath, pluginTitle } from "../lib/catalog";
import { pageTitle, useDocumentTitle } from "../lib/page";

export function WhatsNew() {
  const catalog = useCatalog();
  const [pluginFilter, setPluginFilter] = useState("");
  useDocumentTitle(pageTitle(t("whatsNew.title")));

  const releases = getReleases(catalog);
  const plugins = catalog.plugins.filter((p) => p.releases.length > 0);
  const shown = pluginFilter ? releases.filter((r) => r.plugin.name === pluginFilter) : releases;

  return (
    <main id="main" className="page page--feed" tabIndex={-1}>
      <Link className="back-link" to="/">
        {t("common.backHome")}
      </Link>
      <div className="feed-head">
        <h1>{t("whatsNew.title")}</h1>
        <a className="rss-link" href={`${import.meta.env.BASE_URL}feed.xml`}>
          {t("whatsNew.subscribe")}
        </a>
      </div>

      {plugins.length > 1 && (
        <label className="feed-filter">
          {t("whatsNew.pluginFilter")}
          <select className="select" value={pluginFilter} onChange={(e) => setPluginFilter(e.target.value)}>
            <option value="">{t("whatsNew.allPlugins")}</option>
            {plugins.map((p) => (
              <option value={p.name} key={p.name}>
                {pluginTitle(p)}
              </option>
            ))}
          </select>
        </label>
      )}

      {releases.length === 0 ? (
        <p className="empty-note">{t("whatsNew.empty")}</p>
      ) : (
        <div className="feed-list">
          {shown.map((r) => (
            <Link className="feed-entry" key={`${r.plugin.name}@${r.version}`} to={pluginPath(r.plugin.name)}>
              <span className="meta">
                <span className="version">{t("common.version", { version: r.version })}</span>
                <span className="date">{r.date}</span>
              </span>
              <span className="body">
                <span className="name">
                  {pluginTitle(r.plugin)}
                  {r.isNew && <span className="badge badge--new">{t("whatsNew.newPlugin")}</span>}
                </span>
                <Html as="span" className="summary" html={r.summaryHtml} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
