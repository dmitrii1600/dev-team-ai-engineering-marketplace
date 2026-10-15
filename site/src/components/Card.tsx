import { Link } from "react-router";
import { CopyButton } from "./CopyButton";
import { t } from "../i18n";
import type { Entry } from "../lib/catalog";

export function Card({ entry }: { entry: Entry }) {
  const meta = entry.kind === "plugin" ? entry.author : [entry.pluginDisplayName, entry.author].filter(Boolean).join(" · ");
  return (
    <article className={`card k-${entry.kind}`} data-kind={entry.kind}>
      <div className="card-main">
        <div className="card-top">
          <span className="badge">{t(`kind.singular.${entry.kind}`)}</span>
          <span className="card-version">{t("common.version", { version: entry.version })}</span>
        </div>
        <h3 className="card-title">
          <Link to={entry.to}>{entry.displayName}</Link>
        </h3>
        <p className="card-desc">{entry.description}</p>
        <div className="tag-row">
          {entry.tags.slice(0, 3).map((tag) => (
            <span className="tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      </div>
      <div className="card-foot">
        <span className="card-meta">{meta}</span>
        <div className="card-actions">
          <CopyButton className="btn btn--sm btn--ghost" text={entry.installCommand} label={t("common.copyInstall")} />
          <Link className="btn btn--sm btn--accent" to={entry.to} aria-label={t("common.openName", { name: entry.displayName })}>
            {t("common.open")}
          </Link>
        </div>
      </div>
    </article>
  );
}
