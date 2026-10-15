import { Link } from "react-router";
import { t } from "../i18n";
import { pageTitle, useDocumentTitle } from "../lib/page";

export function NotFound() {
  useDocumentTitle(pageTitle(t("notFound.title")));
  return (
    <main id="main" className="page page--narrow" tabIndex={-1}>
      <meta name="robots" content="noindex" />
      <div className="eyebrow">{t("notFound.eyebrow")}</div>
      <h1 className="start-title">{t("notFound.title")}</h1>
      <p className="start-lead">{t("notFound.text")}</p>
      <div className="narrow-actions">
        <Link className="btn btn--accent btn--lg" to="/">
          {t("notFound.home")}
        </Link>
        <Link className="btn btn--lg" to="/search">
          {t("notFound.search")}
        </Link>
      </div>
    </main>
  );
}
