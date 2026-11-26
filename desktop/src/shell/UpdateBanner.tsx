import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "../i18n";
import type { UpdateState } from "../lib/updater";
import { useBusy } from "../lib/busy";

export function UpdateBanner({ state, onRestart }: { state: UpdateState; onRestart: () => Promise<"busy" | "ok"> }) {
  const { t } = useT();
  const isBusy = useBusy();
  const [hidden, setHidden] = useState(false);
  if (hidden || (state.kind !== "ready" && state.kind !== "installing")) return null;
  return (
    <div className="banner" role="status" data-testid="update-banner">
      <RefreshCw size={16} />
      <span className="grow">
        <b>{t("update.ready")}</b> <span className="muted" style={{ color: "inherit", opacity: 0.85 }}>{t("update.readyVersion", { v: state.version })}</span>
        {isBusy && <> · {t("update.busy")}</>}
      </span>
      <button className="btn ghost" onClick={() => setHidden(true)}>{t("update.later")}</button>
      <button className="btn primary" disabled={isBusy || state.kind === "installing"} onClick={onRestart}>{t("update.restart")}</button>
    </div>
  );
}
