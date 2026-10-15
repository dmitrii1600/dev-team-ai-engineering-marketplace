import { Link, useParams } from "react-router";
import { CopyButton } from "../components/CopyButton";
import { Html } from "../components/Html";
import { Terminal } from "../components/Terminal";
import { useCatalog } from "../context/catalog";
import { t } from "../i18n";
import { tr } from "../i18n/rich";
import { findArtifact, findPlugin, pluginPath, pluginTitle, repoUrl } from "../lib/catalog";
import { pageTitle, useDocumentTitle } from "../lib/page";
import { NotFound } from "./NotFound";

export function ArtifactPage() {
  const { plugin: pluginName = "", type = "", name = "" } = useParams();
  const catalog = useCatalog();
  const artifact = findArtifact(catalog, pluginName, type, name);
  const plugin = findPlugin(catalog, pluginName);
  useDocumentTitle(
    artifact
      ? pageTitle(t("artifact.pageTitle", { name: artifact.displayName, kind: t(`kind.singular.${artifact.type}`) }))
      : pageTitle(t("notFound.title")),
  );

  if (!artifact || !plugin) return <NotFound />;

  const a = artifact;
  const isJson = a.type === "hook" || a.type === "mcp";
  const frontmatter = Object.entries(a.frontmatter);
  const reportTitle = t("artifact.reportTitle", { plugin: a.plugin, name: a.name });
  const reportUrl = `${repoUrl(catalog)}/issues/new?template=artifact-bug.yml&title=${encodeURIComponent(reportTitle)}`;
  const hasPermInfo = Boolean(a.tools?.length || a.model || a.argumentHint);

  return (
    <main id="main" className={`page page--artifact k-${a.type}`} tabIndex={-1}>
      <nav className="crumbs" aria-label={t("artifact.breadcrumb")}>
        <Link to="/search">{t("artifact.crumbCatalog")}</Link>
        <span className="sep"> / </span>
        <Link to={pluginPath(plugin.name)}>{pluginTitle(plugin)}</Link>
        <span className="sep"> / </span>
        <span className="current" aria-current="page">
          {a.name}
        </span>
      </nav>

      <div className="title-row">
        <span className="badge">{t(`kind.singular.${a.type}`)}</span>
        <h1>{a.displayName}</h1>
        {a.invocation && <span className="invocation">{a.invocation}</span>}
      </div>
      <p className="lead">{a.description}</p>

      {hasPermInfo && (
        <section className="perm" aria-label={t("artifact.perm.label")}>
          <div className="perm-title">{t("artifact.perm.title")}</div>
          {a.tools && a.tools.length > 0 ? (
            <ul className="tool-row">
              {a.tools.map((tool) => (
                <li className="tool" key={tool}>
                  {tool}
                </li>
              ))}
            </ul>
          ) : (
            <p className="perm-meta">{t("artifact.perm.noTools")}</p>
          )}
          {(a.model || a.argumentHint) && (
            <div className="perm-meta">
              {a.model && <span>{tr("artifact.perm.model", { model: a.model }, { code: (c) => <code>{c}</code> })}</span>}
              {a.argumentHint && (
                <span>{tr("artifact.perm.argumentHint", { hint: a.argumentHint }, { code: (c) => <code>{c}</code> })}</span>
              )}
            </div>
          )}
        </section>
      )}

      <div className="install-row">
        <Terminal command={plugin.installCommand} />
        <CopyButton className="btn btn--accent btn--lg" text={plugin.installCommand} label={t("common.copyInstall")} />
        {a.invocation && <CopyButton className="btn btn--lg" text={a.invocation} label={t("common.copyInvocation")} />}
      </div>

      <section aria-labelledby="docs-heading">
        <h2 className="section-title" id="docs-heading">
          {t("artifact.documentation")}
        </h2>
        <div className="panel">
          <Html className={isJson ? undefined : "prose"} html={a.bodyHtml} />
        </div>
      </section>

      <div className="artifact-foot">
        {frontmatter.length > 0 && (
          <details className="fm">
            <summary>{t("artifact.frontmatter")}</summary>
            <pre>{frontmatter.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
          </details>
        )}
        <div className="artifact-links">
          <a className="btn" href={a.sourceUrl} target="_blank" rel="noopener noreferrer">
            {t("artifact.viewSource")}
          </a>
          <a className="btn" href={reportUrl} target="_blank" rel="noopener noreferrer">
            {t("artifact.report")}
          </a>
        </div>
      </div>
    </main>
  );
}
