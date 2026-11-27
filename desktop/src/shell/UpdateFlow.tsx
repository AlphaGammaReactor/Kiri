// The visible parts of an update (design page 23): What is new, Updating Kiri, Back where you were,
// and the signature banner. The quiet parts (downloading, a failed download) live in the Activity panel.
import { Check, CircleCheck, Loader2, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useT } from "../i18n";
import { noteLines, type UpdateState } from "../lib/updater";
import { fmtBytes } from "../lib/system";
import { APP_VERSION } from "../lib/platform";
import { Dialog } from "./Dialog";

export const WEBSITE = "https://kiri-production.up.railway.app";

/** Before restarting (ready) or after it (onRestart left out): the version, what changed and what restarting does. */
export function WhatsNewDialog({ version, notes, bytes, fileName, busy, onRestart, onClose }: {
  version: string; notes?: string; bytes?: number; fileName?: string | null; busy?: boolean; onRestart?: () => void; onClose: () => void;
}) {
  const { t } = useT();
  const lines = noteLines(notes);
  return (
    <Dialog title={onRestart ? t("upd.new.title", { v: version }) : t("upd.new.after", { v: version })} onClose={onClose}
      footer={<>
        <span className="small muted grow">{t("upd.new.full")}</span>
        {onRestart ? <>
          <button className="btn" onClick={onClose}>{t("update.later")}</button>
          <button className="btn primary" disabled={busy} onClick={onRestart}>{t("update.restart")}</button>
        </> : <button className="btn primary" onClick={onClose}>{t("upd.new.ok")}</button>}
      </>}>
      {onRestart && <p className="small muted">{bytes ? t("upd.new.have", { c: APP_VERSION, s: fmtBytes(bytes) }) : t("upd.new.haveNoSize", { c: APP_VERSION })}</p>}
      <div className="eyebrow" style={{ margin: "12px 0 6px" }}>{t("upd.new.what")}</div>
      {lines.length ? <ul className="upd-notes">{lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="small muted">{t("upd.new.none")}</p>}
      {onRestart && (
        <div className="upd-safe"><ShieldCheck size={16} />
          <span>{busy ? t("update.busy") : fileName ? t("upd.new.safe", { f: fileName }) : t("upd.new.safeNoFile")}</span></div>
      )}
    </Dialog>
  );
}

/** Full-window steps while Kiri saves, installs and reopens. */
export function UpdatingScreen({ state, fileName }: { state: Extract<UpdateState, { kind: "installing" }>; fileName?: string | null }) {
  const { t } = useT();
  const order = ["saved", "checked", "installing"] as const;
  const at = order.indexOf(state.step);
  const steps = [
    { title: t("upd.ing.saved"), sub: fileName ?? t("upd.ing.noProject") },
    { title: t("upd.ing.checked"), sub: t("upd.ing.checkedSub") },
    { title: t("upd.ing.installing", { v: state.version }), sub: "" },
  ];
  return (
    <div className="upd-screen" role="alertdialog" aria-live="polite" aria-label={t("upd.ing.title")}>
      <div className="upd-card">
        <div className="row-gap" style={{ marginBottom: 16 }}><span className="upd-k">K</span><h2 className="dialog-title" style={{ margin: 0 }}>{t("upd.ing.title")}</h2></div>
        {steps.map((s, i) => {
          // The signature was checked when the download finished, so that step is done once installing starts.
          const done = i < at || (i === 1 && at === 2);
          const now = i === at;
          return (
            <div key={i} className={`upd-step ${done ? "done" : now ? "now" : ""}`}>
              <span className="upd-dot">{done ? <Check size={12} /> : now ? <Loader2 size={12} className="spin" /> : null}</span>
              <div className="grow"><b>{s.title}</b>{s.sub && <div className="small muted">{s.sub}</div>}
                {i === 2 && now && <div className="progress indeterminate"><span /></div>}</div>
            </div>
          );
        })}
        <p className="small muted" style={{ marginTop: 14 }}>{t("upd.ing.note")}</p>
      </div>
    </div>
  );
}

/** Shown once per version: an update was refused because its signature did not match. */
export function SignatureBanner({ onReport, onWebsite, onClose }: { onReport: () => void; onWebsite: () => void; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="banner bad" role="alert" data-testid="update-signature">
      <TriangleAlert size={16} />
      <span className="grow"><b>{t("upd.sig.title")}</b><br /><span className="small">{t("upd.sig.body", { v: APP_VERSION })}</span></span>
      <button className="btn ghost" onClick={onReport}>{t("upd.sig.report")}</button>
      <button className="btn" onClick={onWebsite}>{t("upd.sig.website")}</button>
      <button className="icon-btn" aria-label={t("upd.close")} onClick={onClose}><X size={16} /></button>
    </div>
  );
}

/** After the restart: Kiri reopened the project where the person was. */
export function UpdatedToast({ version, reopened, onWhatsNew, onClose }: { version: string; reopened: boolean; onWhatsNew: () => void; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="toast upd-toast" role="status">
      <CircleCheck size={16} />
      <span>{reopened ? t("upd.back.reopened", { v: version }) : t("upd.back.plain", { v: version })}</span>
      <button className="link" onClick={onWhatsNew}>{t("upd.back.whatsNew")}</button>
      <button className="icon-btn" aria-label={t("upd.close")} onClick={onClose}><X size={14} /></button>
    </div>
  );
}
