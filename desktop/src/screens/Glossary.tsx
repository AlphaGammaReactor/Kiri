// Glossary (design page 18): both names, pinyin search, what it is / how to read it / a common mistake.
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FlaskConical, Search } from "lucide-react";
import { useT } from "../i18n";
import { TERMS, fold, type Term } from "../i18n/glossary";
import { progress } from "../lib/progress";

const CATS = ["all", "survival", "statistics", "genomics"] as const;

export function Glossary({ initial }: { initial?: string }) {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");
  const [sel, setSel] = useState(initial ?? TERMS[0].id);
  useEffect(() => { progress.mark("glossary"); }, []);
  const name = (x: Term) => (lang === "zh" ? x.zh : x.en);
  const other = (x: Term) => (lang === "zh" ? x.en : x.zh);
  const two = (p: [string, string]) => (lang === "en" ? [p[0]] : lang === "zh" ? [p[1]] : p);

  const list = useMemo(() => {
    const f = fold(q);
    const sorted = [...TERMS].sort((a, b) => (lang === "zh" ? a.py.localeCompare(b.py) : a.en.localeCompare(b.en)));
    return sorted.filter((x) => (cat === "all" || x.cat === cat)
      && (!f || [x.en, x.zh, x.py, x.abbr ?? ""].some((s) => fold(s).includes(f))));
  }, [q, cat, lang]);
  const pinyinHit = q.trim() && /^[a-z\s]+$/i.test(q) && list.some((x) => fold(x.py).includes(fold(q)) && !fold(x.en).includes(fold(q)));
  const term = TERMS.find((x) => x.id === sel) ?? TERMS[0];

  return (
    <div className="gl">
      <aside className="gl-side">
        <h1 className="page">{t("gl.title")}</h1>
        <label className="input"><Search size={15} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("gl.search")} />{pinyinHit && <span className="mono small muted">{t("gl.pinyin")}</span>}</label>
        <div className="row-gap">
          {CATS.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c === "all" ? t("gl.all", { n: TERMS.length }) : t(`gl.cat.${c}`)}</button>)}
        </div>
        <div className="card gl-list">
          {list.length === 0 && <div className="side-empty">{t("gl.none")}</div>}
          {list.map((x) => (
            <button key={x.id} className={`gl-item ${x.id === term.id ? "on" : ""}`} onClick={() => setSel(x.id)}>
              <span><b>{name(x)}</b><span className="small muted">{other(x)} · {x.py}</span></span><ChevronRight size={15} />
            </button>
          ))}
        </div>
      </aside>
      <article className="card gl-main">
        <h2 className="gl-term">{name(term)}</h2>
        <div className="sub">{other(term)} · {term.py}{term.abbr ? ` · ${term.abbr}` : ""}</div>
        {([["gl.what", term.what], ["gl.read", term.read], ["gl.mistake", term.mistake]] as const).map(([k, v]) => (
          <section key={k}><div className="eyebrow">{t(k)}</div>{two(v).map((s, i) => <p key={i} className={i ? "muted" : ""}>{s}</p>)}</section>
        ))}
        {term.used && <div className="gl-used"><FlaskConical size={15} />{t("gl.used", { w: two(term.used).join(" · ") })}</div>}
        {term.related && <div className="row-gap" style={{ marginTop: 14 }}><span className="small muted">{t("gl.related")}</span>
          {term.related.map((r) => { const x = TERMS.find((y) => y.id === r); return x && <button key={r} className="chip" onClick={() => setSel(r)}>{name(x)}</button>; })}</div>}
        <div className="grow" />
        <div className="small muted gl-foot">{t("gl.foot")}</div>
      </article>
    </div>
  );
}
