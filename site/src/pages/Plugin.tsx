import { Link, useParams } from "react-router";
import { CopyButton } from "../components/CopyButton";
import { Html } from "../components/Html";
import { RelativeDate } from "../components/RelativeDate";
import { Terminal } from "../components/Terminal";
import { useCatalog } from "../context/catalog";
import { t } from "../i18n";
import { tr } from "../i18n/rich";
import {
  ARTIFACT_TYPES,
  artifactPath,
  findPlugin,
  pluginArtifacts,
  pluginPath,
  pluginTitle,
} from "../lib/catalog";
import { pageTitle, useBackToSearch, useDocumentTitle } from "../lib/page";
import { NotFound } from "./NotFound";

export function PluginPage() {
  const { plugin: name = "" } = useParams();
  const catalog = useCatalog();
  const plugin = findPlugin(catalog, name);
  const goBack = useBackToSearch();
  useDocumentTitle(plugin ? pageTitle(pluginTitle(plugin)) : pageTitle(t("notFound.title")));

  if (!plugin) return <NotFound />;

  const title = pluginTitle(plugin);
  const artifacts = pluginArtifacts(catalog, plugin);
  const groups = ARTIFACT_TYPES.map((type) => ({ type, items: artifacts.filter((a) => a.type === type) })).filter(
    (g) => g.items.length > 0,
  );
  const installable = new Set(catalog.plugins.map((p) => p.name));

  return (
    <main id="main" className="page page--plugin" tabIndex={-1}>
      <Link className="back-link" to="/" onClick={goBack}>
        {t("common.back")}
      </Link>

      <div className="plugin-head">
        <div className="plugin-icon" aria-hidden="true">
          ◆
        </div>
        <div className="info">
          <div className="title-row">
            <h1>{title}</h1>
            <span className="badge badge--lg k-plugin">{t("common.version", { version: plugin.version })}</span>
            {plugin.compatibility && <span className="badge badge--lg badge--ok">✓ {plugin.compatibility}</span>}
          </div>
          <p className="lead">{plugin.description}</p>
          <div className="byline">
            {plugin.author?.name}
            {plugin.author && plugin.updatedAt ? " · " : ""}
            {plugin.updatedAt && tr("plugin.updated", { date: plugin.updatedAt }, { time: () => <RelativeDate date={plugin.updatedAt as string} /> })}
          </div>
        </div>
      </div>

      <div className="install-row">
        <Terminal command={plugin.installCommand} />
        <CopyButton className="btn btn--accent btn--lg" text={plugin.installCommand} label={t("common.copyInstall")} />
        <a className="btn btn--lg" href={plugin.sourceUrl} target="_blank" rel="noopener noreferrer">
          {t("common.viewOnGithub")}
        </a>
      </div>

      {groups.length > 0 && (
        <section className="section" aria-labelledby="contents-heading">
          <h2 className="section-title" id="contents-heading">
            {t("plugin.contents")}
          </h2>
          {groups.map((g) => (
            <div className={`group k-${g.type}`} key={g.type}>
              <div className="group-head">
                <span className="dot" aria-hidden="true"></span>
                <h3 className="name">{t(`kind.plural.${g.type}`)}</h3>
                <span className="count">{g.items.length}</span>
              </div>
              <div className="mini-grid">
                {g.items.map((a) => (
                  <Link className="mini-card" key={a.id} to={artifactPath(a)}>
                    <span className="row">
                      <span className="name">{a.displayName}</span>
                      {a.invocation && <span className="inv">{a.invocation}</span>}
                    </span>
                    <span className="desc">{a.description}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {plugin.dependencies && plugin.dependencies.length > 0 && (
        <section className="section" aria-labelledby="deps-heading">
          <h2 className="section-title" id="deps-heading">
            {t("plugin.dependencies")}
          </h2>
          <div className="dep-row">
            {plugin.dependencies.map((d) => {
              const depName = d.split("@")[0];
              return installable.has(depName) && !d.includes("@") ? (
                <Link className="dep" key={d} to={pluginPath(depName)}>
                  {d}
                </Link>
              ) : (
                <span className="dep" key={d}>
                  {d}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {plugin.readmeHtml && (
        <section className="section" aria-labelledby="readme-heading">
          <h2 className="section-title" id="readme-heading">
            {t("plugin.readme")}
          </h2>
          <Html className="panel prose" html={plugin.readmeHtml} />
        </section>
      )}

      {plugin.releases.length > 0 && (
        <section aria-labelledby="changelog-heading">
          <h2 className="section-title" id="changelog-heading">
            {t("plugin.changelog")}
          </h2>
          <div className="release-cards">
            {plugin.releases.map((r) => (
              <div className="release-card" key={r.version}>
                <div className="head">
                  <span className="version">{t("common.version", { version: r.version })}</span>
                  <span className="date">{r.date}</span>
                </div>
                {Object.entries(r.sectionsHtml).map(([section, items]) =>
                  items.length > 0 ? (
                    <div key={section}>
                      <h4>{section}</h4>
                      <ul>
                        {items.map((html, i) => (
                          <Html as="li" html={html} key={i} />
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
