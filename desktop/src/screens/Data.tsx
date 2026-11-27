// Data manager (design page 19, frame 13): the cohorts this project uses, downloads and the data folder.
import { useCallback, useEffect, useState } from "react";
import { CloudDownload, FolderOpen, Info, RotateCcw, Trash2, Upload } from "lucide-react";
import { owndata } from "../lib/owndata";
import { useDatasets } from "./Import";
import { useT } from "../i18n";
import type { ProjectSummary } from "../lib/api";
import { analyses, type CohortStatus } from "../lib/analyses";
import { fmtBytes, system, type Storage } from "../lib/system";
import { isTauri } from "../lib/platform";

type Tab = "project" | "cache" | "mine";

export function Data({ p, say, onImport }: { p: ProjectSummary; say: (s: string) => void; onLater: () => void; onImport: () => void }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("project");
  const [cohort, setCohort] = useState<CohortStatus | null>(null);
  const [store, setStore] = useState<Storage | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const mine = useDatasets();

  const load = useCallback(() => {
    analyses.cohort().then(setCohort).catch(() => {});
    system.storage().then(setStore).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const busy = cohort && Object.values(cohort.packs).some((x) => x.state === "downloading");
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(load, 1500);
    return () => clearInterval(id);
  }, [busy, load]);

  const download = async (proj: string) => { await analyses.download(proj).catch(() => say(t("dl.failed"))); load(); };
  const remove = async (proj: string) => {
    setConfirm(null);
    await system.removeCohort(proj).then(() => say(t("data.removed", { p: proj }))).catch(() => say(t("data.removeFailed")));
    load();
  };
  const sizeOf = (proj: string) => store?.cohorts.find((c) => c.project === proj);
  const projects = cohort?.projects ?? [];
  const ready = projects.filter((x) => cohort?.packs[x]?.ready).length;

  return (
    <div className="data">
      <div className="ws-head">
        <div>
          <div className="crumb mono">{p.project.name}</div>
          <h1 className="page ws-title">{t("nav.data")}</h1>
        </div>
        <div className="ws-actions">
          <button className="btn primary" disabled={p.read_only} onClick={onImport}><Upload size={14} />{t("data.import")}</button>
        </div>
      </div>
      <div className="tabs line" role="tablist">
        {(["project", "cache", "mine"] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(`data.tab.${k}`)}</button>
        ))}
      </div>

      {tab === "project" && (
        <>
          <div className="stat-row">
            <div className="card stat"><div className="eyebrow">{t("data.onDisk")}</div><div className="big">{store ? fmtBytes(store.cohort_bytes) : "…"}</div><div className="mono small muted">{store ? t("data.free", { s: fmtBytes(store.free_bytes) }) : ""}</div></div>
            <div className="card stat"><div className="eyebrow">{t("data.cohorts")}</div><div className="big">{projects.length}</div><div className="mono small muted">{t("data.cohortsSub")}</div></div>
            <div className="card stat"><div className="eyebrow">{t("data.offline")}</div><div className="big">{cohort?.sample_slice ? t("data.offline.sample") : ready === projects.length ? t("data.offline.all") : `${ready}/${projects.length}`}</div>
              <div className="mono small muted">{t("data.offline.sub", { n: ready, m: projects.length })}</div></div>
          </div>
          <div className="card table-card">
            <table className="tbl">
              <thead><tr><th>{t("data.col.cohort")}</th><th>{t("data.col.samples")}</th><th>{t("data.col.version")}</th><th>{t("data.col.size")}</th><th>{t("data.col.status")}</th><th /></tr></thead>
              <tbody>
                {projects.map((proj) => {
                  const st = cohort!.packs[proj];
                  const s = sizeOf(proj);
                  const pct = st?.total ? Math.round(((st.done ?? 0) / st.total) * 100) : 0;
                  return (
                    <tr key={proj}>
                      <td><b>{proj}</b><div className="small muted">{t("data.source")}</div></td>
                      <td className="mono">{s?.samples ?? "—"}</td>
                      <td className="mono">GDC · STAR · v36</td>
                      <td className="mono">{s?.bytes ? fmtBytes(s.bytes) : "—"}</td>
                      <td>
                        {st?.ready ? <span className="badge ok">● {t("data.st.ready")}</span>
                          : st?.state === "downloading" ? <div className="row-gap"><div className="progress" style={{ width: 120 }}><span style={{ width: `${pct}%` }} /></div><span className="mono small">{pct}%</span></div>
                          : st?.state === "failed" ? <span className="badge warn">● {t("data.st.failed")}</span>
                          : cohort?.sample_slice ? <span className="badge">● {t("data.st.sample")}</span>
                          : <span className="badge">● {t("data.st.none")}</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {!st?.ready && st?.state !== "downloading" && <button className="btn sm" onClick={() => download(proj)}>{st?.state === "failed" ? <RotateCcw size={14} /> : <CloudDownload size={14} />}{st?.state === "failed" ? t("dl.retry") : t("data.download")}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cohort?.sample_slice && <div className="note-banner"><Info size={16} /><div><b>{t("data.sample.title")}</b><div className="small">{t("data.sample.body")}</div></div></div>}
          <div className="note-banner"><Info size={16} /><div><b>{t("data.saved.title")}</b><div className="small">{t("data.saved.body")}</div></div></div>
        </>
      )}

      {tab === "cache" && store && (
        <>
          <div className="card table-card">
            <table className="tbl">
              <thead><tr><th>{t("data.col.cohort")}</th><th>{t("data.col.samples")}</th><th>{t("data.col.genes")}</th><th>{t("data.col.size")}</th><th>{t("data.col.status")}</th><th /></tr></thead>
              <tbody>
                {store.cohorts.length === 0 && <tr><td colSpan={6} className="muted">{t("data.cache.empty")}</td></tr>}
                {store.cohorts.map((c) => (
                  <tr key={c.project}>
                    <td><b>{c.project}</b></td>
                    <td className="mono">{c.samples ?? "—"}</td>
                    <td className="mono">{c.genes ?? "—"}</td>
                    <td className="mono">{fmtBytes(c.bytes)}</td>
                    <td>{c.ready ? <span className="badge ok">● {t("data.st.ready")}</span> : c.state === "downloading" ? <span className="badge">● {t("data.st.downloading")}</span> : <span className="badge warn">● {t("data.st.partial")}</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      {confirm === c.project
                        ? <span className="row-gap"><span className="small">{t("data.remove.sure")}</span><button className="btn sm" onClick={() => remove(c.project)}>{t("nb.delete")}</button><button className="btn ghost sm" onClick={() => setConfirm(null)}>{t("file.cancel")}</button></span>
                        : <button className="icon-btn" aria-label={t("nb.delete")} disabled={c.state === "downloading"} onClick={() => setConfirm(c.project)}><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="setting-row" style={{ borderTop: 0 }}>
              <div><div className="setting-title">{t("set.data.folder")}</div><div className="setting-help">{t("set.data.folder.help")}</div></div>
              <div className="row-gap"><span className="mono small">{store.data_dir}</span>{isTauri && <button className="btn sm" onClick={() => system.reveal().catch(() => {})}><FolderOpen size={14} />{t("set.data.reveal")}</button>}</div>
            </div>
            <div className="setting-row"><div className="setting-title">{t("set.data.free")}</div><span className="mono">{fmtBytes(store.free_bytes)}</span></div>
          </div>
        </>
      )}

      {tab === "mine" && (
        <>
          <div className="card table-card">
            <table className="tbl">
              <thead><tr><th>{t("data.mine.col.name")}</th><th>{t("data.mine.col.rows")}</th><th>{t("data.mine.col.values")}</th><th>{t("data.mine.col.when")}</th><th /></tr></thead>
              <tbody>
                {(mine.list ?? []).length === 0 && <tr><td colSpan={5} className="muted">{mine.list ? t("data.mine.empty") : "…"}</td></tr>}
                {(mine.list ?? []).map((d) => (
                  <tr key={d.id}>
                    <td><b>{d.name}</b><div className="small muted">{d.file_name} · {d.units}{d.in_use ? ` · ${t("data.mine.inUse")}` : ""}</div></td>
                    <td className="mono">{d.n_samples}</td>
                    <td className="mono">{d.n_values}</td>
                    <td className="mono small">{(d.imported_at ?? "").slice(0, 16).replace("T", " ")}</td>
                    <td style={{ textAlign: "right" }}>
                      {confirm === d.id
                        ? <span className="row-gap"><span className="small">{t("data.remove.sure")}</span>
                            <button className="btn sm" onClick={async () => { setConfirm(null); await owndata.remove(d.id).catch(() => {}); say(t("data.mine.deleted", { n: d.name })); mine.reload(); }}>{t("nb.delete")}</button>
                            <button className="btn ghost sm" onClick={() => setConfirm(null)}>{t("file.cancel")}</button></span>
                        : <button className="icon-btn" aria-label={t("nb.delete")} disabled={p.read_only} onClick={() => setConfirm(d.id)}><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="note-banner"><Info size={16} /><div><b>{t("data.mine.title")}</b><div className="small">{t("data.mine.body")}</div></div></div>
        </>
      )}
    </div>
  );
}
