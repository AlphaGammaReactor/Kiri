// Choose one of the sample projects that ship with Kiri. Their data is bundled, so they open offline.
import { useEffect, useState } from "react";
import { FlaskConical, Play } from "lucide-react";
import { useT } from "../i18n";
import { api, type SampleInfo } from "../lib/api";
import { Dialog } from "./Dialog";

export function SamplePicker({ ready, onPick, onClose }: { ready: boolean; onPick: (id: string) => void; onClose: () => void }) {
  const { t, lang } = useT();
  const [items, setItems] = useState<SampleInfo[] | null>(null);
  useEffect(() => { if (ready) api.samples(lang === "zh" ? "zh" : "en").then(setItems).catch(() => setItems([])); }, [ready, lang]);
  const fallback: SampleInfo[] = [{ id: "parl-mavs", name: "PARL–MAVS", question: "", targets: ["PARL", "MAVS"], cancers: ["COAD", "READ"], template: "two_gene" }];
  return (
    <Dialog title={t("smp.title")} onClose={onClose} width={620}>
      <p>{t("smp.body")}</p>
      <div className="smp-list">
        {(items ?? fallback).map((s) => (
          <button key={s.id} className="smp-card" onClick={() => onPick(s.id)}>
            <span className="smp-icon"><FlaskConical size={18} /></span>
            <span className="smp-text">
              <b>{s.name}</b>
              {s.question && <span>{s.question}</span>}
              <span className="row-gap" style={{ marginTop: 6 }}>
                <span className="badge ok sm">● {s.targets.join(" · ")}</span>
                <span className="badge sm">● {s.cancers.join(", ")}</span>
                <span className="badge sm">● {t(s.template === "two_gene" ? "home.tpl.two" : "home.tpl.one")}</span>
              </span>
            </span>
            <span className="btn primary sm"><Play size={13} />{t("smp.open")}</span>
          </button>
        ))}
      </div>
      <p className="small muted">{t("smp.note")}</p>
    </Dialog>
  );
}
