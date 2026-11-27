// Import my data (design page 19, frame 13): choose a file, check what each column is, import into the .kiri file.
import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, FileSpreadsheet, Info, Lock, TriangleAlert, Upload } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import type { ProjectSummary } from "../lib/api";
import { analyses } from "../lib/analyses";
import { pickExportPath } from "../lib/files";
import { owndata, pickTableToOpen, TEMPLATE_CLINICAL, TEMPLATE_MATRIX, type Dataset, type ImportCheck, type Orientation, type Preview, type Role } from "../lib/owndata";
import { Select } from "./workspace/Frame";

const ROLES: Role[] = ["sample_id", "group", "time", "event", "value", "unused"];
const ERRS = ["import_not_found", "import_too_big", "import_unreadable", "import_type", "import_empty"];
const ENCODINGS = ["utf-8", "gb18030", "big5", "utf-16", "latin-1"];
type EventVal = 0 | 1 | null;

export function Import({ p, say, onDone, onCancel, onOpen }: {
  p: ProjectSummary; say: (s: string) => void; onDone: () => void; onCancel: () => void;
  onOpen: (k: "expression" | "survival" | "correlation") => void;
}) {
  const { t } = useT();
  const [path, setPath] = useState<string | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [events, setEvents] = useState<Record<string, EventVal>>({});
  const [checks, setChecks] = useState<ImportCheck[]>([]);
  const [unit, setUnit] = useState<"days" | "months" | "years">("months");
  const [scale, setScale] = useState<"as_is" | "log2" | "linear">("as_is");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Dataset | null>(null);
  const [showRows, setShowRows] = useState(false);

  const load = async (file: string, o: { encoding?: string | null; sheet?: string | null; orientation?: Orientation | null } = {}) => {
    setBusy(true); setError(null);
    try {
      const r = await owndata.preview({ path: file, ...o });
      setPv(r); setRoles(r.roles); setEvents(r.event_values); setChecks(r.checks); setUnit(r.time_unit);
      setName((n) => n || r.file_name.replace(/\.[^.]+$/, ""));
    } catch (e) { setError((e as { code?: string }).code ?? "import_unreadable"); setPv(null); }
    setBusy(false);
  };
  const choose = async () => { const f = await pickTableToOpen(t("imp.pick")); if (f) { setPath(f); setName(""); load(f); } };
  // Re-check when the person changes a column or an event value.
  useEffect(() => {
    if (!path || !pv || pv.orientation === "genes_in_rows") return;
    const id = setTimeout(() => owndata.check({ path, encoding: pv.encoding === "excel" ? null : pv.encoding, sheet: pv.sheet, orientation: pv.orientation, roles, event_map: events })
      .then((r) => { setChecks(r.checks); setEvents((e) => ({ ...r.event_values, ...pick(e, Object.keys(r.event_values)) })); }).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [roles, JSON.stringify(events)]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRole = (col: string, r: Role) => setRoles((rs) => {
    const next = { ...rs };
    if (r !== "value" && r !== "unused") for (const k of Object.keys(next)) if (next[k] === r) next[k] = "unused"; // one of each
    next[col] = r;
    return next;
  });
  const genes = pv?.orientation === "genes_in_rows";
  const problems = checks.filter((c) => c.level === "problem");
  const nValues = Object.values(roles).filter((r) => r === "value").length;
  const evCol = Object.keys(roles).find((c) => roles[c] === "event");
  const timeCol = Object.keys(roles).find((c) => roles[c] === "time");

  const commit = async () => {
    if (!path || !pv) return;
    setBusy(true);
    try {
      const d = await owndata.commit({ path, encoding: pv.encoding === "excel" ? null : pv.encoding, sheet: pv.sheet, orientation: pv.orientation, roles, event_map: events, name: name.trim() || pv.file_name, time_unit: unit, scale });
      setDone(d);
    } catch (e) { setError((e as { code?: string }).code ?? "import_failed"); }
    setBusy(false);
  };
  const saveTemplate = async (kind: "clinical" | "matrix") => {
    const out = await pickExportPath(t("imp.tpl.save"), kind === "clinical" ? "kiri-template-samples" : "kiri-template-genes", kind === "clinical" ? "csv" : "txt");
    if (!out) return;
    await analyses.exportFile(out, new TextEncoder().encode(kind === "clinical" ? TEMPLATE_CLINICAL : TEMPLATE_MATRIX)).then(() => say(t("imp.tpl.saved", { p: out }))).catch(() => say(t("imp.failed")));
  };

  // Step 3: imported
  if (done) return (
    <div className="imp">
      <div className="ws-head"><div><div className="crumb mono">{t("nav.data")}  /  {t("imp.crumb")}</div>
        <h1 className="page ws-title">{t("imp.done.title", { n: done.name })}</h1><div className="small muted">{t("imp.step", { n: 3, s: t("imp.step3") })}</div></div></div>
      <div className="card imp-done">
        <span className="imp-done-ic"><Check size={22} /></span>
        <div className="grow">
          <p className="plain">{t(done.orientation === "genes_in_rows" ? "imp.done.genes" : "imp.done.samples", { s: done.n_samples, v: done.n_values })}</p>
          <ul className="small imp-done-list">
            <li>{done.has_survival ? t("imp.done.surv") : t("imp.done.noSurv")}</li>
            <li>{done.groups.length ? t("imp.done.groups", { g: done.groups.slice(0, 6).join(", ") }) : t("imp.done.noGroups")}</li>
            <li>{t("imp.done.units", { u: done.units })}</li>
          </ul>
          <div className="row-gap" style={{ marginTop: 12 }}>
            {done.groups.length > 0 && <button className="btn primary" onClick={() => onOpen("expression")}>{t("imp.go.groups")}</button>}
            {done.has_survival && <button className="btn" onClick={() => onOpen("survival")}>{t("imp.go.survival")}</button>}
            {done.n_values > 1 && <button className="btn" onClick={() => onOpen("correlation")}>{t("imp.go.corr")}</button>}
            <button className="btn ghost" onClick={onDone}>{t("imp.go.overview")}</button>
          </div>
        </div>
      </div>
      <p className="small muted imp-lock"><Lock size={13} /> {t("imp.lock")}</p>
    </div>
  );

  // Step 1: choose a file
  if (!pv) return (
    <div className="imp">
      <div className="ws-head"><div><div className="crumb mono">{t("nav.data")}  /  {t("imp.crumb")}</div>
        <h1 className="page ws-title">{t("imp.title")}</h1><div className="small muted">{t("imp.step", { n: 1, s: t("imp.step1") })}</div></div>
        <div className="ws-actions"><button className="btn ghost" onClick={onCancel}>{t("imp.back")}</button></div></div>
      <div className="imp-start">
        <button className="card imp-drop" onClick={choose} disabled={busy || p.read_only}>
          <Upload size={28} />
          <b>{busy ? t("imp.reading") : t("imp.choose")}</b>
          <span className="small muted">{t("imp.formats")}</span>
        </button>
        <div className="card imp-help">
          <div className="eyebrow">{t("imp.shapes")}</div>
          <div className="imp-shape"><FileSpreadsheet size={18} /><div><b>{t("imp.shape.samples")}</b><p className="small">{t("imp.shape.samples.body")}</p>
            <button className="link small" onClick={() => saveTemplate("clinical")}>{t("imp.tpl.samples")}</button></div></div>
          <div className="imp-shape"><FileSpreadsheet size={18} /><div><b>{t("imp.shape.genes")}</b><p className="small">{t("imp.shape.genes.body")}</p>
            <button className="link small" onClick={() => saveTemplate("matrix")}>{t("imp.tpl.genes")}</button></div></div>
          {error && <p className="small warn-text"><CircleAlert size={13} /> {t((ERRS.includes(error) ? `imp.err.${error}` : "imp.failed") as StringKey)}</p>}
          <p className="small muted imp-lock"><Lock size={13} /> {t("imp.lock")}</p>
        </div>
      </div>
    </div>
  );

  // Step 2: check columns
  const encOk = pv.encoding !== "latin-1";
  return (
    <div className="imp">
      <div className="ws-head">
        <div><div className="crumb mono">{t("nav.data")}  /  {t("imp.crumb")}</div>
          <h1 className="page ws-title">{t("imp.titleFile", { f: pv.file_name })}</h1>
          <div className="small muted">{t("imp.step", { n: 2, s: t("imp.step2") })}</div></div>
        <div className="ws-actions">
          <button className="btn ghost" onClick={() => { setPv(null); setPath(null); }}>{t("imp.back")}</button>
          <button className="btn primary" disabled={busy || problems.length > 0 || p.read_only} onClick={commit}>
            {genes ? t("imp.goGenes", { n: pv.n_genes ?? 0 }) : t("imp.go", { n: pv.n_rows })}</button>
        </div>
      </div>
      <div className="imp-grid">
        <div className="imp-main">
          <div className={`imp-enc ${encOk ? "" : "warn"}`}>
            {encOk ? <Check size={15} /> : <TriangleAlert size={15} />}
            <span className="grow">{pv.encoding === "excel" ? t("imp.enc.excel", { s: pv.sheet ?? "" }) : encOk ? t("imp.enc.ok", { e: encName(pv.encoding) }) : t("imp.enc.guess")}</span>
            {pv.encoding === "excel" && (pv.sheets?.length ?? 0) > 1
              ? <Select value={pv.sheet ?? ""} options={(pv.sheets ?? []).map((s) => ({ value: s, label: s }))} onChange={(s) => load(path!, { sheet: s })} />
              : pv.encoding !== "excel" && <Select value={pv.encoding} options={ENCODINGS.map((e) => ({ value: e, label: encName(e) }))} onChange={(e) => load(path!, { encoding: e, orientation: pv.orientation })} />}
          </div>
          <div className="row-gap imp-orient">
            <span className="small muted">{t("imp.orient")}</span>
            <div className="segmented">
              <button aria-pressed={!genes} onClick={() => load(path!, { encoding: pv.encoding === "excel" ? null : pv.encoding, sheet: pv.sheet, orientation: "samples_in_rows" })}>{t("imp.orient.samples")}</button>
              <button aria-pressed={genes} onClick={() => load(path!, { encoding: pv.encoding === "excel" ? null : pv.encoding, sheet: pv.sheet, orientation: "genes_in_rows" })}>{t("imp.orient.genes")}</button>
            </div>
          </div>
          <div className="card imp-table-card">
            <div className="imp-scroll">
              <table className="tbl imp-table">
                {!genes && (
                  <thead className="imp-roles"><tr>{pv.columns.map((c) => (
                    <th key={c}>
                      <select className="imp-role" value={roles[c] ?? "unused"} onChange={(e) => setRole(c, e.target.value as Role)} aria-label={t("imp.roleFor", { c })}>
                        {ROLES.map((r) => <option key={r} value={r}>{t(`imp.role.${r}` as StringKey)}</option>)}
                      </select>
                      <div className={`imp-status ${status(c, roles, checks)}`}>{t(`imp.st.${status(c, roles, checks)}` as StringKey)}</div>
                    </th>))}</tr></thead>
                )}
                <tbody>
                  <tr className="imp-head">{pv.columns.map((c) => <td key={c}>{c}</td>)}</tr>
                  {pv.rows.map((row, i) => (
                    <tr key={i}>{row.map((v, j) => {
                      const col = pv.columns[j];
                      const flag = !genes && ((roles[col] === "time" && isMissing(v)) || (roles[col] === "event" && events[v] == null && v !== ""));
                      return <td key={j} className={`${flag ? "flag" : ""} ${roles[col] === "unused" ? "muted" : ""}`}>{v}</td>;
                    })}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mono small muted">{genes ? t("imp.showingGenes", { r: pv.rows.length, n: pv.n_genes ?? 0, s: pv.n_samples ?? 0 }) : t("imp.showing", { r: pv.rows.length, n: pv.n_rows })}</div>
        </div>

        <aside className="imp-side">
          <div className="eyebrow">{checks.length ? t("imp.things", { n: checks.length }) : t("imp.allGood")}</div>
          {checks.map((c) => (
            <div key={c.code} className={`card imp-check ${c.level}`}>
              <div className="row-gap"><span className="imp-check-ic">{c.level === "info" ? <Info size={15} /> : <TriangleAlert size={15} />}</span>
                <b>{t(`imp.ck.${c.code}` as StringKey, { n: c.n ?? 0, c: evCol ?? "" })}</b></div>
              <p className="small">{t(`imp.ck.${c.code}.body` as StringKey, { n: c.n ?? 0, c: evCol ?? "", t: timeCol ?? "" })}</p>
              {(c.code === "event_mixed" || c.code === "event_unknown") && (c.values ?? []).map((v) => (
                <div key={v} className="imp-ev"><span className="mono">{v}</span><span className="small muted">{c.counts?.[v] ?? ""}</span>
                  <Select value={String(events[v] ?? "")} onChange={(x) => setEvents((e) => ({ ...e, [v]: x === "" ? null : (Number(x) as 0 | 1) }))}
                    options={[{ value: "1", label: t("imp.ev.event") }, { value: "0", label: t("imp.ev.censored") }, { value: "", label: t("imp.ev.leave") }]} /></div>
              ))}
              {c.code === "no_time" && (c.rows?.length ?? 0) > 0 && <button className="link small" onClick={() => setShowRows((s) => !s)}>{showRows ? t("imp.hideRows") : t("imp.showRows", { n: c.n ?? 0 })}</button>}
              {c.code === "no_time" && showRows && <div className="mono small muted">{t("imp.rowsAre", { r: (c.rows ?? []).map((r) => r + 2).join(", ") })}</div>}
            </div>
          ))}
          <div className="card imp-opts">
            <label className="field"><span>{t("imp.name")}</span><input className="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
            {!genes && timeCol && (
              <label className="field"><span>{t("imp.unit", { c: timeCol })}</span>
                <Select value={unit} onChange={(u) => setUnit(u as typeof unit)} options={(["days", "months", "years"] as const).map((u) => ({ value: u, label: t(`imp.unit.${u}`) }))} /></label>
            )}
            <label className="field"><span>{genes ? t("imp.scaleGenes") : t("imp.scale", { n: nValues })}</span>
              <Select value={scale} onChange={(s) => setScale(s as typeof scale)} options={[
                { value: "as_is", label: t("imp.scale.as_is") }, { value: "log2", label: t("imp.scale.log2") }, { value: "linear", label: t("imp.scale.linear") }]} />
              <span className="help">{t(`imp.scale.${scale}.help` as StringKey)}</span></label>
          </div>
          {error && <p className="small warn-text"><CircleAlert size={13} /> {t("imp.failed")}</p>}
          <p className="small muted imp-lock"><Lock size={13} /> {t("imp.lock")}</p>
        </aside>
      </div>
    </div>
  );
}

const pick = <T,>(o: Record<string, T>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) as Record<string, T>;
const isMissing = (v: string) => ["", "na", "n/a", "nan", "-", "—", "–", "null", "缺失"].includes(v.trim().toLowerCase());
const encName = (e: string) => ({ "utf-8": "UTF-8", gb18030: "GB18030", big5: "Big5", "utf-16": "UTF-16", "latin-1": "Latin-1" }[e] ?? e);
function status(col: string, roles: Record<string, Role>, checks: ImportCheck[]) {
  const r = roles[col];
  if (r === "unused") return "unused";
  if (r === "event" && checks.some((c) => c.code === "event_mixed" || c.code === "event_unknown")) return "check";
  if (r === "time" && checks.some((c) => c.code === "negative_time")) return "check";
  if (r === "value" && checks.some((c) => c.code === "non_numeric")) return "check";
  return "ok";
}

export function useDatasets() {
  const [list, setList] = useState<Dataset[] | null>(null);
  const reload = () => owndata.list().then(setList).catch(() => setList([]));
  useEffect(() => { reload(); }, []);
  return useMemo(() => ({ list, reload }), [list]);
}
