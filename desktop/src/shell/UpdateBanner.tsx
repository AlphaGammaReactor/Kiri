import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "../i18n";
import type { UpdateState } from "../lib/updater";
import { useBusy } from "../lib/busy";

/** "Update ready": Restart to update, Later (hidden until the next launch) and What is new. */
export function UpdateBanner({ state, onRestart, onWhatsNew }: { state: UpdateState; onRestart: () => void; onWhatsNew: () => void }) {
  const { t } = useT();
  const isBusy = useBusy();
  const [hidden, setHidden] = useState(false);
  if (hidden || state.kind !== "ready") return null;
  return (
    <div className="banner" role="status" data-testid="update-banner">
      <RefreshCw size={16} />
      <span className="grow">
        <b>{t("update.ready")}</b> <span className="muted" style={{ color: "inherit", opacity: 0.85 }}>{t("update.readyVersion", { v: state.version })}</span>
        {isBusy && <> · {t("update.busy")}</>}
      </span>
      <button className="btn ghost" onClick={onWhatsNew}>{t("upd.whatsNew")}</button>
      <button className="btn ghost" onClick={() => setHidden(true)}>{t("update.later")}</button>
      <button className="btn primary" disabled={isBusy} onClick={onRestart}>{t("update.restart")}</button>
    </div>
  );
}
