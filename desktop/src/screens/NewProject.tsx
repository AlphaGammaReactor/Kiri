import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, TriangleAlert, X } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { api, type Cancer, type GeneCheck, type TemplateId } from "../lib/api";

type Chip = { text: string; check: GeneCheck | null };

export type NewProjectData = {
  name: string; question: string; template: TemplateId; targets: string[]; cancers: string[]; datasets: string[]; standard_panel: boolean;
};

export function NewProject({ initialTemplate, onCancel, onCreate, notYet }: {
  initialTemplate: TemplateId; onCancel: () => void; onCreate: (d: NewProjectData) => void; notYet: () => void;
}) {
  const { t, lang } = useT();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [template, setTemplate] = useState<TemplateId>(initialTemplate);
  const [chips, setChips] = useState<Chip[]>([]);
  const [typing, setTyping] = useState("");
  const [cancerList, setCancerList] = useState<Cancer[]>([]);
  const [cancers, setCancers] = useState<string[]>([]);
  const [panel, setPanel] = useState(true);

  useEffect(() => { api.cancers().then(setCancerList).catch(() => {}); }, []);

  const tpls: [TemplateId, StringKey, StringKey][] = [
    ["blank", "home.tpl.blank", "np.tpl.blank.sub"], ["one_gene", "np.tpl.one", "np.tpl.one.sub"], ["two_gene", "home.tpl.two", "np.tpl.two.sub"],
    ["own_table", "np.tpl.table", "np.tpl.table.sub"], ["course", "home.tpl.course", "np.tpl.course.sub"],
  ];
  const fileName = `${(name || "Untitled").trim()}.kiri`;

  const addChip = async (raw: string) => {
    const text = raw.trim();
    if (!text || chips.some((c) => c.text.toUpperCase() === text.toUpperCase())) return;
    setChips((c) => [...c, { text, check: null }]);
    const check = await api.checkGene(text).catch(() => null);
    setChips((cs) => cs.map((c) => (c.text === text ? { ...c, check } : c)));
  };
  const replaceChip = (from: string, to: string) =>
    setChips((cs) => cs.map((c) => (c.text === from ? { text: to, check: { input: to, status: "ok", symbol: to } } : c)));
  const problem = chips.find((c) => c.check && c.check.status !== "ok");
  const targets = chips.filter((c) => c.check?.status === "ok").map((c) => c.check!.symbol!);
  const datasets = cancers.map((c) => `TCGA-${c}`);

  return (
    <div className="np">
      <div className="mono crumb">{t("np.crumb", { n: step })}</div>
      <h1 className="page" style={{ marginBottom: 14 }}>{step === 1 ? t("np.q.title") : t("np.t.title")}</h1>
      <div className="np-grid">
        <section className="card np-main">
          {step === 1 ? (
            <div className="np-fields">
              <label className="field"><span>{t("np.name")}</span>
                <input className="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="PARL–MAVS in CRC" /></label>
              <label className="field"><span>{t("np.question")}</span>
                <input className="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("np.question.placeholder")} />
                <span className="help">{t("np.question.help")}</span></label>
              <div className="field"><span>{t("np.template")}</span>
                <div className="tpl-grid">
                  {tpls.map(([id, k, sub]) => (
                    <button key={id} className={`tpl-pick ${template === id ? "on" : ""}`} onClick={() => setTemplate(id)} aria-pressed={template === id}>
                      <b>{t(k)}</b><span className="muted">{t(sub)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="np-fields">
              <div className="field"><span>{t("np.targets")}</span>
                <div className="chip-input" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
                  {chips.map((c) => (
                    <span key={c.text} className={`gene ${c.check?.status === "ok" ? "ok" : c.check ? "bad" : ""}`}>
                      {c.check?.status === "ok" ? <Check size={13} /> : c.check ? <TriangleAlert size={13} /> : null}
                      {c.check?.status === "ok" ? c.check.symbol : c.text}
                      <button aria-label="remove" onClick={() => setChips((cs) => cs.filter((x) => x !== c))}><X size={12} /></button>
                    </span>
                  ))}
                  <input value={typing} placeholder={chips.length ? "" : t("np.targets.placeholder")} onChange={(e) => setTyping(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === "," || e.key === " ") && !e.nativeEvent.isComposing) { e.preventDefault(); addChip(typing); setTyping(""); }
                      if (e.key === "Backspace" && !typing && chips.length) setChips((cs) => cs.slice(0, -1));
                    }}
                    onBlur={() => { if (typing) { addChip(typing); setTyping(""); } }} />
                </div>
                {problem && problem.check && (
                  <div className="suggest">
                    {problem.check.status === "alias" ? t("np.aliasOf", { g: problem.text, s: problem.check.symbol! }) : t("np.notGene", { g: problem.text })}
                    {(problem.check.suggestions ?? []).map((sug, i) => (
                      <button key={sug} className={`chip ${i === 0 ? "on" : ""}`} onClick={() => replaceChip(problem.text, sug)}>{sug}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="field"><span>{t("np.cancers")}</span>
                <CancerPicker list={cancerList} value={cancers} onChange={setCancers} lang={lang} placeholder={t("np.cancers.placeholder")} />
                <span className="help">{t("np.cancers.help")}</span>
              </div>
              {cancers.length > 0 && (
                <div className="field"><span>{t("np.data")}</span>
                  {cancers.map((c) => (
                    <div key={c} className="data-row"><span className="box on"><Check size={12} strokeWidth={3} /></span><span>TCGA-{c} · GDC</span>
                      <span className="mono muted" style={{ marginLeft: "auto", fontSize: 11.5 }}>{t("np.data.tcga")}</span></div>
                  ))}
                </div>
              )}
              <div className="note ok" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div><div className="setting-title">{t("np.panel")}</div><div className="setting-help">{t("np.panel.sub")}</div>
                  <div className="setting-help" style={{ marginTop: 4, fontStyle: "italic" }}>{t("np.panel.later")}</div></div>
                <label className="switch"><input type="checkbox" checked={panel} onChange={(e) => setPanel(e.target.checked)} /><span /></label>
              </div>
            </div>
          )}
          <div className="np-foot">
            <button className="btn ghost" onClick={() => (step === 1 ? onCancel() : setStep(1))}>{step === 1 ? t("np.cancel") : t("fr.back")}</button>
            {step === 1 ? <button className="btn primary" onClick={() => setStep(2)}>{t("np.next")}</button>
              : <button className="btn primary" disabled={chips.some((c) => !c.check)}
                  onClick={() => onCreate({ name: name.trim() || targets.join("–") || "Untitled", question, template, targets, cancers, datasets, standard_panel: panel })}>{t("np.create")}</button>}
          </div>
        </section>
        <aside className="card side-note">
          {step === 1 ? (<><div className="eyebrow">{t("np.savedAs")}</div><p>{t("np.savedAs.body", { f: fileName })}</p></>)
            : (<><div className="eyebrow">{t("np.help.title")}</div><p>{t("np.help.body")}</p><button className="btn ghost" style={{ padding: 0 }} onClick={notYet}>{t("np.requestFile")}</button></>)}
        </aside>
      </div>
    </div>
  );
}

function CancerPicker({ list, value, onChange, lang, placeholder }: { list: Cancer[]; value: string[]; onChange: (v: string[]) => void; lang: string; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const label = (c: Cancer) => (lang === "en" ? `${c.en} (${c.code})` : lang === "zh" ? `${c.zh}（${c.code}）` : `${c.zh} ${c.en}（${c.code}）`);
  const shown = useMemo(() => list.filter((c) => !q || `${c.code} ${c.en} ${c.zh}`.toLowerCase().includes(q.toLowerCase())), [list, q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="picker" ref={ref}>
      <button className="text picker-btn" onClick={() => setOpen(!open)}>
        <span>{value.length ? value.map((v) => { const c = list.find((x) => x.code === v); return c ? label(c) : v; }).join(lang === "en" ? ", " : "、") : <span className="muted">{placeholder}</span>}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu picker-menu">
          <input className="text" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={{ width: "100%", marginBottom: 4 }} />
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            {shown.map((c) => {
              const on = value.includes(c.code);
              return (
                <button key={c.code} onClick={() => onChange(on ? value.filter((v) => v !== c.code) : [...value, c.code])}>
                  <span><span className="mono" style={{ display: "inline-block", width: 48 }}>{c.code}</span>{lang === "en" ? c.en : lang === "zh" ? c.zh : `${c.zh} · ${c.en}`}</span>
                  {on && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
