import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, TriangleAlert, X } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { api, type Cancer, type GeneCheck, type GeneHit, type TemplateId } from "../lib/api";

type Chip = { text: string; check: GeneCheck | null; name?: string; from?: string };

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
    const [cancerList, setCancerList] = useState<Cancer[]>([]);
  const [cancers, setCancers] = useState<string[]>([]);
  const [panel, setPanel] = useState(true);

  useEffect(() => { api.cancers().then(setCancerList).catch(() => {}); }, []);

  const tpls: [TemplateId, StringKey, StringKey][] = [
    ["blank", "home.tpl.blank", "np.tpl.blank.sub"], ["one_gene", "np.tpl.one", "np.tpl.one.sub"], ["two_gene", "home.tpl.two", "np.tpl.two.sub"],
    ["own_table", "np.tpl.table", "np.tpl.table.sub"], ["course", "home.tpl.course", "np.tpl.course.sub"],
  ];
  const fileName = `${(name || "Untitled").trim()}.kiri`;

  // Adds a gene. An approved symbol goes straight in; another name for one gene (p53, HER2)
  // is swapped for the official symbol with a note; anything else stays flagged with suggestions.
  const addChip = async (raw: string, known?: GeneHit) => {
    const text = (known?.symbol ?? raw).trim();
    if (!text) return;
    const has = (cs: Chip[], x: string) => cs.some((c) => c.text.toUpperCase() === x.toUpperCase());
    if (known) {
      setChips((cs) => (has(cs, text) ? cs : [...cs, { text, name: known.name, check: { input: text, status: "ok", symbol: text, name: known.name } }]));
      return;
    }
    if (has(chips, text)) return;
    setChips((cs) => [...cs, { text, check: null }]);
    const check = await api.checkGene(text).catch(() => null);
    setChips((cs) => {
      const i = cs.findIndex((c) => c.text === text && !c.check);
      if (i < 0) return cs;
      if (check?.status === "alias" && check.symbol) {
        if (has(cs, check.symbol)) return cs.filter((_, j) => j !== i);
        const next = { text: check.symbol, name: check.name, from: text, check: { ...check, status: "ok" as const, suggestions: (check.suggestions ?? []).filter((x) => x !== check.symbol) } };
        return cs.map((c, j) => (j === i ? next : c));
      }
      return cs.map((c, j) => (j === i ? { ...c, check, name: check?.name } : c));
    });
  };
  const replaceChip = (from: string, to: string) =>
    setChips((cs) => cs.map((c) => (c.text === from ? { text: to, check: { input: to, status: "ok", symbol: to } } : c)));
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
              <div className="field"><span className="row-between"><span>{t("np.targets")}</span>
                {chips.length > 0 && <span className="muted mono" style={{ fontSize: 11.5, fontWeight: 400 }}>{t("np.targets.count", { n: chips.length })}</span>}</span>
                <GeneInput chips={chips} setChips={setChips} onAdd={addChip} />
                {chips.filter((c) => c.check && c.check.status !== "ok" || c.from).map((c) => (
                  <div key={c.text} className={`suggest ${c.from ? "info" : ""}`}>
                    <span>{c.from ? t("np.aliasAdded", { g: c.from, s: c.text }) : c.check!.status === "alias" ? t("np.aliasOf", { g: c.text, s: c.check!.symbol! }) : t("np.notGene", { g: c.text })}</span>
                    {!c.from && (c.check?.suggestions ?? []).filter((sug) => sug !== c.text).map((sug, i) => (
                      <button key={sug} className={`chip ${i === 0 && !c.from ? "on" : ""}`} onClick={() => replaceChip(c.text, sug)}>{sug}</button>
                    ))}
                    {c.from && <button className="link" style={{ marginLeft: "auto" }} onClick={() => setChips((cs) => cs.map((x) => (x === c ? { ...x, from: undefined } : x)))}>OK</button>}
                  </div>
                ))}
                <span className="help">{t("np.targets.help")}</span>
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

function GeneInput({ chips, setChips, onAdd }: { chips: Chip[]; setChips: (f: (c: Chip[]) => Chip[]) => void; onAdd: (raw: string, known?: GeneHit) => void }) {
  const { t } = useT();
  const [typing, setTyping] = useState("");
  const [hits, setHits] = useState<GeneHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [hitsFor, setHitsFor] = useState("");
  const [hi, setHi] = useState(0); // highlighted row: Enter adds it, as in any search box
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = typing.trim();
    if (!q) { setHits([]); setBusy(false); return; }
    const n = ++seq.current;
    setBusy(true);
    const h = setTimeout(() => {
      api.searchGenes(q).then((r) => { if (n === seq.current) { setHits(r); setHitsFor(q); setHi(0); setBusy(false); } })
        .catch(() => { if (n === seq.current) { setHits([]); setBusy(false); } });
    }, 90);
    return () => clearTimeout(h);
  }, [typing]);

  const taken = new Set(chips.map((c) => c.text.toUpperCase()));
  const commit = (hit?: GeneHit) => {
    const q = typing.trim();
    if (hit) onAdd(hit.symbol, hit);
    else if (q) onAdd(q); // no list for this text yet (typed fast or pasted): checked on its own
    setTyping(""); setHi(0); setHits([]); setHitsFor("");
  };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = e.clipboardData.getData("text").split(/[\s,;，、]+/).filter(Boolean);
    if (parts.length > 1) { e.preventDefault(); parts.forEach((p) => onAdd(p)); }
  };
  const showMenu = open && typing.trim().length > 0;
  const fresh = !busy && hitsFor === typing.trim() && hits.length > 0;

  return (
    <div className="gene-box" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); if (typing.trim()) commit(); } }}>
      <div className="chip-input" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
        {chips.map((c) => (
          <span key={c.text} className={`gene ${c.check?.status === "ok" ? "ok" : c.check ? "bad" : ""}`} title={c.name ?? c.check?.name ?? ""}>
            {c.check?.status === "ok" ? <Check size={13} /> : c.check ? <TriangleAlert size={13} /> : null}
            {c.text}
            <button aria-label={t("np.gene.remove", { g: c.text })} onClick={() => setChips((cs) => cs.filter((x) => x !== c))}><X size={12} /></button>
          </span>
        ))}
        <input value={typing} placeholder={chips.length ? "" : t("np.targets.placeholder")} spellCheck={false} autoCapitalize="characters"
          role="combobox" aria-expanded={showMenu} aria-autocomplete="list" aria-controls="gene-hits" aria-label={t("np.targets")}
          onFocus={() => setOpen(true)} onPaste={onPaste}
          onChange={(e) => { setTyping(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); setHi((i) => (i + 1) % hits.length); }
            else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); setHi((i) => (i <= 0 ? hits.length - 1 : i - 1)); }
            else if (e.key === "Enter" || e.key === "Tab" && typing.trim() || e.key === "," || e.key === " ") {
              if (!typing.trim()) { if (e.key !== "Tab") e.preventDefault(); return; }
              e.preventDefault(); commit(fresh ? hits[hi] : undefined);
            }
            else if (e.key === "Escape") setOpen(false);
            else if (e.key === "Backspace" && !typing && chips.length) setChips((cs) => cs.slice(0, -1));
          }} />
      </div>
      {showMenu && (
        <div className="menu gene-menu" id="gene-hits" role="listbox">
          {hits.map((h, i) => (
            <button key={h.symbol} role="option" aria-selected={i === hi} tabIndex={-1} className={i === hi ? "hi" : ""}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(h)}>
              <span className="gene-hit">
                <b className="mono">{h.symbol}</b>
                <span className="gene-name">{h.name}</span>
                {h.via && <span className="badge sm">{t("np.gene.alias", { a: h.via })}</span>}
              </span>
              {taken.has(h.symbol.toUpperCase()) && <Check size={14} />}
            </button>
          ))}
          {!hits.length && <div className="menu-note muted">{busy ? t("np.gene.searching") : t("np.gene.none", { q: typing.trim() })}</div>}
        </div>
      )}
    </div>
  );
}

function CancerPicker({ list, value, onChange, lang, placeholder }: { list: Cancer[]; value: string[]; onChange: (v: string[]) => void; lang: string; placeholder: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const name = (c: Cancer) => (lang === "en" ? c.en : lang === "zh" ? c.zh : `${c.zh} · ${c.en}`);
  const shown = useMemo(() => list.filter((c) => !q || `${c.code} ${c.en} ${c.zh}`.toLowerCase().includes(q.trim().toLowerCase())), [list, q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((v) => v !== code) : [...value, code]);
  return (
    <div className="picker" ref={ref}>
      <div className={`text picker-btn ${open ? "open" : ""}`} role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}>
        <span className="picker-chips">
          {value.length ? value.map((v) => {
            const c = list.find((x) => x.code === v);
            return (
              <span key={v} className="gene ok" title={c ? name(c) : v}>
                <span className="mono">{v}</span>{c && <span className="cancer-name">{name(c)}</span>}
                <button aria-label={t("np.cancers.remove", { c: v })} onClick={(e) => { e.stopPropagation(); toggle(v); }}><X size={12} /></button>
              </span>
            );
          }) : <span className="muted">{placeholder}</span>}
        </span>
        <ChevronDown size={16} />
      </div>
      {open && (
        <div className="menu picker-menu">
          <div className="menu-search"><Search size={14} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && shown.length === 1) { toggle(shown[0].code); setQ(""); } }} /></div>
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            {shown.map((c) => {
              const on = value.includes(c.code);
              return (
                <button key={c.code} role="option" aria-selected={on} onClick={() => toggle(c.code)}>
                  <span className="cancer-row"><span className={`box ${on ? "on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                    <span className="mono" style={{ display: "inline-block", width: 48 }}>{c.code}</span>{name(c)}</span>
                </button>
              );
            })}
          </div>
          <div className="menu-foot">
            <span className="muted">{t("np.cancers.selected", { n: value.length })}</span>
            <span style={{ display: "flex", gap: 8 }}>
              {value.length > 0 && <button className="btn ghost sm" onClick={() => onChange([])}>{t("np.cancers.clear")}</button>}
              <button className="btn sm" onClick={() => { setOpen(false); setQ(""); }}>{t("np.cancers.done")}</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
