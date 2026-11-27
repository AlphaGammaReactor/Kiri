// Figure guide (plan v2 screen 23): start from a question, get the recommended figure and test, and why.
// Matching is a plain keyword match over the questions below; there is no AI in Kiri.
import { useMemo, useState } from "react";
import { Compass, Search, Check, X, ArrowRight, Info } from "lucide-react";
import { useT } from "../i18n";
import { RECIPES, matchRecipe, type Pair, type Recipe } from "../i18n/guide";

export type GuideAction = NonNullable<Recipe["action"]>;

export function Guide({ initialQuery, initialId, projectOpen, onAction, onSample }: {
  initialQuery?: string; initialId?: Recipe["id"]; projectOpen: boolean;
  onAction: (a: GuideAction) => void; onSample: () => void;
}) {
  const { t, lang } = useT();
  const two = (p: Pair) => (lang === "en" ? p[0] : lang === "zh" ? p[1] : `${p[1]}\n${p[0]}`);
  const [q, setQ] = useState(initialQuery ?? "");
  const matches = useMemo(() => matchRecipe(q), [q]);
  const [sel, setSel] = useState<Recipe["id"]>(initialId ?? matchRecipe(initialQuery ?? "")[0]?.id ?? "tn");
  const shown = RECIPES.find((r) => r.id === sel) ?? RECIPES[0];
  const pick = (id: Recipe["id"]) => setSel(id);

  return (
    <div className="guide">
      <div className="home-head">
        <div>
          <h1 className="page"><Compass size={22} style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--color-accent-text)" }} />{t("nav.figureGuide")}</h1>
          <div className="sub">{t("guide.sub")}</div>
        </div>
      </div>
      <div className="guide-grid">
        <aside className="card guide-side">
          <label className="input">
            <Search size={15} color="var(--color-text-muted)" />
            <input autoFocus value={q} placeholder={t("guide.placeholder")} onChange={(e) => {
              setQ(e.target.value);
              const m = matchRecipe(e.target.value);
              if (m.length) setSel(m[0].id);
            }} />
          </label>
          <p className="small muted guide-noai"><Info size={12} /> {t("guide.noAi")}</p>
          {q.trim() && !matches.length && <p className="small warn-text">{t("guide.noMatch")}</p>}
          <div className="eyebrow" style={{ margin: "12px 0 6px" }}>{q.trim() && matches.length ? t("guide.matches", { n: matches.length }) : t("guide.all")}</div>
          <ul className="guide-list">
            {(q.trim() && matches.length ? matches : RECIPES).map((r) => (
              <li key={r.id}>
                <button aria-current={r.id === sel ? "true" : undefined} onClick={() => pick(r.id)}>
                  <span>{two(r.question)}</span>
                  {!r.action && <span className="badge sm">{t("guide.later")}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="card guide-main">
          <div className="eyebrow">{t("guide.question")}</div>
          <h2 className="guide-q">{two(shown.question)}</h2>
          <div className="guide-rec">
            <div><span className="eyebrow">{t("guide.figure")}</span><b>{two(shown.figure)}</b></div>
            <div><span className="eyebrow">{t("guide.test")}</span><b>{two(shown.test)}</b></div>
          </div>
          <div className="guide-sec"><span className="eyebrow">{t("guide.why")}</span><p>{two(shown.why)}</p></div>
          <div className="guide-sec"><span className="eyebrow">{t("guide.read")}</span><p>{two(shown.read)}</p></div>
          <div className="guide-sec caution"><span className="eyebrow">{t("guide.caution")}</span><p>{two(shown.caution)}</p></div>
          <div className="guide-sec"><span className="eyebrow">{t("guide.alts")}</span>
            <ul className="guide-alts">
              {shown.alts.map((a) => (
                <li key={a.figure[0]}>
                  <span className={`guide-verdict ${a.verdict}`}>{a.verdict === "ok" ? <Check size={13} /> : <X size={13} />}</span>
                  <div><b>{two(a.figure)}</b> <span className="small muted">{a.verdict === "ok" ? t("guide.ok") : t("guide.avoid")}</span><p className="small">{two(a.why)}</p></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="guide-foot">
            {shown.action ? (projectOpen
              ? <button className="btn primary" onClick={() => onAction(shown.action!)}>{t("guide.make")}<ArrowRight size={15} /></button>
              : <><button className="btn primary" onClick={onSample}>{t("guide.trySample")}</button><span className="small muted">{t("guide.needProject")}</span></>)
              : <span className="small muted">{t("guide.laterBody")}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
