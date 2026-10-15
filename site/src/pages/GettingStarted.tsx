import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import siteConfig from "../../site.config.json";
import { Terminal } from "../components/Terminal";
import { useCatalog } from "../context/catalog";
import { t } from "../i18n";
import { tr } from "../i18n/rich";
import { pluginTitle, repoUrl } from "../lib/catalog";
import { pageTitle, useDocumentTitle } from "../lib/page";

type Mode = "cli" | "session";

export function GettingStarted() {
  const catalog = useCatalog();
  useDocumentTitle(pageTitle(t("start.title")));

  const { repo, name: marketplace } = catalog.marketplace;
  const plugins = [...catalog.plugins].sort((a, b) => a.name.localeCompare(b.name));
  const [mode, setMode] = useState<Mode>("cli");
  const [selected, setSelected] = useState(plugins[0]?.name ?? "");
  const plugin = selected || t("start.pluginPlaceholder");

  // Single source of truth: every command is generated from the catalog and site.config.json.
  // `tail` is what follows "claude plugin " (CLI) or "/plugin " (in a session).
  const cmd = (tail: string) => `${mode === "cli" ? "claude plugin" : "/plugin"} ${tail.replace("{plugin}", plugin)}`;
  const tails = {
    add: `marketplace add ${repo}`,
    install: `install {plugin}@${marketplace}`,
    refresh: `marketplace update ${marketplace}`,
    update: `update {plugin}@${marketplace}`,
  };
  const readmeTeam = `${repoUrl(catalog)}#for-the-whole-team-in-a-project-repository`;
  const code = { code: (c: ReactNode) => <code>{c}</code> };

  return (
    <main id="main" className="page page--start" tabIndex={-1}>
      <Link className="back-link" to="/">
        {t("common.backHome")}
      </Link>
      <h1 className="start-title">{t("start.title")}</h1>
      <p className="start-lead">{t("start.lead")}</p>

      <div className="mode-toggle" role="group" aria-label={t("start.modeLabel")}>
        <button type="button" aria-pressed={mode === "cli"} onClick={() => setMode("cli")}>
          {t("start.mode.cli")}
        </button>
        <button type="button" aria-pressed={mode === "session"} onClick={() => setMode("session")}>
          {t("start.mode.session")}
        </button>
      </div>

      <ol className="steps">
        <li className="step">
          <div className="step-num" aria-hidden="true">
            {1}
          </div>
          <div className="step-body">
            <h2>{t("start.step1.title")}</h2>
            <p>{t("start.step1.text")}</p>
            <p className="step-note">{tr("start.step1.note", { version: siteConfig.minClaudeCodeVersion }, code)}</p>
            <Terminal command={cmd(tails.add)} copy />
          </div>
        </li>

        <li className="step">
          <div className="step-num" aria-hidden="true">
            {2}
          </div>
          <div className="step-body">
            <h2>{t("start.step2.title")}</h2>
            <p>{t("start.step2.text")}</p>
            {plugins.length > 1 && (
              <label className="step-select">
                {t("start.pluginSelect")}
                <select
                  className="select"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  aria-label={t("start.pluginSelectLabel")}
                >
                  {plugins.map((p) => (
                    <option value={p.name} key={p.name}>
                      {pluginTitle(p)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Terminal command={cmd(tails.install)} copy />
            <p className="step-note">{tr("start.step2.note", {}, code)}</p>
          </div>
        </li>

        <li className="step">
          <div className="step-num" aria-hidden="true">
            {3}
          </div>
          <div className="step-body">
            <h2>{t("start.step3.title")}</h2>
            <p>{t("start.step3.text")}</p>
            <Terminal command={cmd(tails.refresh)} copy />
            <Terminal command={cmd(tails.update)} copy />
            <p className="step-note">{tr("start.step3.note", { marketplace }, code)}</p>
          </div>
        </li>
      </ol>

      <div className="info-panel">{tr("start.info.update", {}, { strong: (c) => <strong>{c}</strong> })}</div>
      <div className="info-panel">
        {tr(
          "start.info.team",
          {},
          {
            strong: (c) => <strong>{c}</strong>,
            code: (c) => <code>{c}</code>,
            link: (c) => (
              <a href={readmeTeam} target="_blank" rel="noopener noreferrer">
                {c}
              </a>
            ),
          },
        )}
      </div>
    </main>
  );
}
