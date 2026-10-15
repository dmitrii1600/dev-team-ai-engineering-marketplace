import { CopyButton } from "./CopyButton";
import { t } from "../i18n";

interface Props {
  command: string;
  /** Adds the inline "Copy" button used by the Getting started steps. */
  copy?: boolean;
}

// Terminal block for commands: `$` prompt, mono text, optional inline copy button.
export function Terminal({ command, copy = false }: Props) {
  return (
    <div className={copy ? "terminal terminal--step" : "terminal"}>
      <span className="prompt" aria-hidden="true">
        $
      </span>
      <code className="cmd">{command}</code>
      {copy && <CopyButton className="terminal-copy" text={command} label={t("common.copy")} copiedLabel={t("common.copiedShort")} />}
    </div>
  );
}
