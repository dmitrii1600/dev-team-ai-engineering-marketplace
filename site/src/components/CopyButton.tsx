import { useEffect, useRef, useState } from "react";
import { useToast } from "../context/toast";
import { t } from "../i18n";
import { copyText } from "../lib/clipboard";

interface Props {
  /** The exact string that is copied. */
  text: string;
  label: string;
  /** Replaces the label for 2 s after a successful copy. Defaults to "Copied ✓". */
  copiedLabel?: string;
  className?: string;
}

export function CopyButton({ text, label, copiedLabel, className = "btn" }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    const ok = await copyText(text);
    if (!ok) {
      toast(t("common.copyFailed"), "error");
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
    toast(t("common.toastCopied"));
  };

  return (
    <button type="button" className={copied ? `${className} is-copied` : className} onClick={() => void onClick()}>
      {copied ? (copiedLabel ?? t("common.copied")) : label}
    </button>
  );
}
