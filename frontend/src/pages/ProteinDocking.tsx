import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAppSelector, useAppDispatch } from "../store";
import type { RootState } from "../store";
import { usePageState } from "../hooks/usePageState";
import { addToast } from "../store/errorSlice";
import { InfoTooltip } from "../components/ui";
import { runProteinDocking, fetchTaskStatus } from "../services/api";

export default function ProteinDocking() {
  const { t } = useTranslation();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);

  const projectGenes = useMemo(
    () => activeProject?.proteins?.map((p) => p.gene_symbol) ?? [],
    [activeProject?.proteins]
  );

  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [uiState, setUiState] = usePageState<{
    receptorGene: string;
    ligandGene: string;
    algorithm: string;
    currentJob: { job_id: string; status: string; message: string; progress?: number } | null;
    history: Array<{ job_id: string; receptor: string; ligand: string; status: string; timestamp: string }>;
  }>("docking", {
    receptorGene: "",
    ligandGene: "",
    algorithm: "cluspro",
    currentJob: null,
    history: [],
  });

  const { receptorGene, ligandGene, algorithm, history, currentJob: jobStatus } = uiState;
  
  const setReceptorGene = (v: string) => setUiState(s => ({ ...s, receptorGene: v }));
  const setLigandGene = (v: string) => setUiState(s => ({ ...s, ligandGene: v }));
  const setAlgorithm = (v: string) => setUiState(s => ({ ...s, algorithm: v }));

  const handleRunDocking = async () => {
    if (!activeProject || !receptorGene || !ligandGene) return;
    setIsSubmitting(true);
    try {
      const resp = await runProteinDocking(activeProject.id, receptorGene, ligandGene, algorithm);
      if (resp.data) {
        setUiState(s => ({ ...s, currentJob: resp.data }));
        dispatch(addToast({
          type: "success",
          title: t("modules.docking.toast_submitted_title"),
          message: t("modules.docking.toast_submitted_desc"),
          duration: 3000,
        }));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      dispatch(addToast({
        type: "error",
        title: t("modules.docking.toast_failed_title"),
        message: errorMessage || t("common.error"),
        duration: 5000,
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!jobStatus || ["completed", "failed"].includes(jobStatus.status)) return;

    const interval = setInterval(async () => {
      try {
        const resp = await fetchTaskStatus(jobStatus.job_id);
        if (resp.data) {
          const newStatusInfo = {
            job_id: resp.data.task_id,
            status: resp.data.status,
            progress: resp.data.progress,
            message: resp.data.status === "completed" 
              ? t("modules.docking.success_msg")
              : resp.data.error || t("modules.docking.waiting_msg"),
          };
          
          setUiState(s => ({ ...s, currentJob: newStatusInfo }));

          // Add to history if completed successfully
          if (resp.data.status === "completed") {
            setUiState((s) => ({
              ...s,
              history: [
                {
                  job_id: resp.data!.task_id,
                  receptor: receptorGene,
                  ligand: ligandGene,
                  status: "completed",
                  timestamp: new Date().toISOString(),
                },
                ...s.history.filter(h => h.job_id !== resp.data!.task_id), // Prevent duplicates
              ],
            }));
          }

          if (resp.data.status === "failed") {
            dispatch(addToast({
              type: "error",
              title: t("modules.docking.toast_task_failed_title"),
              message: resp.data.error || t("modules.docking.toast_task_failed_desc"),
              duration: 5000,
            }));
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobStatus, dispatch, ligandGene, receptorGene, setUiState, t]);

  const hasProteins = projectGenes.length >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between border-b border-kiri-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            {t("nav.docking")}
            <InfoTooltip tooltipKey="tooltips.docking" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("modules.docking.subtitle", "Run high-confidence protein-protein docking models and refine complexes.")}
          </p>
        </div>
      </div>

      {!hasProteins ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4 opacity-40">🧩</div>
          <h3 className="text-lg font-semibold text-kiri-text-muted mb-2">
            {t("modules.docking.no_proteins_title")}
          </h3>
          <p className="text-sm text-kiri-text-dim max-w-md">
            {t("modules.docking.no_proteins_desc")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: Configuration */}
          <div className="lg:col-span-1 space-y-6 bg-kiri-surface border border-kiri-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-kiri-text mb-4">{t("modules.docking.config_title")}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-kiri-text-muted mb-1">{t("modules.docking.receptor")}</label>
                <select
                  value={receptorGene}
                  onChange={(e) => setReceptorGene(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-kiri-border bg-kiri-surface-hover text-kiri-text focus:outline-none focus:border-kiri-accent transition-colors"
                >
                  <option value="">{t("modules.docking.select_receptor")}</option>
                  {projectGenes.map((gene) => (
                    <option key={`rec-${gene}`} value={gene} disabled={gene === ligandGene}>
                      {gene}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-kiri-text-muted mb-1">{t("modules.docking.ligand")}</label>
                <select
                  value={ligandGene}
                  onChange={(e) => setLigandGene(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-kiri-border bg-kiri-surface-hover text-kiri-text focus:outline-none focus:border-kiri-accent transition-colors"
                >
                  <option value="">{t("modules.docking.select_ligand")}</option>
                  {projectGenes.map((gene) => (
                    <option key={`lig-${gene}`} value={gene} disabled={gene === receptorGene}>
                      {gene}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-kiri-text-muted mb-1">{t("modules.docking.algorithm")}</label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-kiri-border bg-kiri-surface-hover text-kiri-text focus:outline-none focus:border-kiri-accent transition-colors"
                >
                  <option value="hdock">{t("modules.docking.algo_hdock")}</option>
                  <option value="cluspro">{t("modules.docking.algo_cluspro")}</option>
                  <option value="zdock">{t("modules.docking.algo_zdock")}</option>
                  <option value="haddock">{t("modules.docking.algo_haddock")}</option>
                  <option value="alphafold">{t("modules.docking.algo_alphafold")}</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleRunDocking}
              disabled={!receptorGene || !ligandGene || isSubmitting}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                !receptorGene || !ligandGene || isSubmitting
                  ? "bg-kiri-surface-hover text-kiri-border cursor-not-allowed"
                  : "bg-kiri-accent text-kiri-bg hover:opacity-90 shadow-[0_0_12px_rgba(0,255,136,0.2)]"
              }`}
            >
              {isSubmitting ? t("modules.docking.submitting") : t("modules.docking.run_button")}
            </button>

            {/* Analysis History */}
            {history.length > 0 && (
              <div className="mt-8 pt-6 border-t border-kiri-border">
                <h4 className="text-sm font-semibold text-kiri-text mb-3">{t("modules.docking.history_title")}</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.map((item) => (
                    <div 
                      key={item.job_id}
                      onClick={() => setUiState(s => ({ ...s, currentJob: { job_id: item.job_id, status: item.status, message: t("modules.docking.restored_msg") } }))}
                      className="p-3 text-left rounded-lg border border-kiri-border bg-kiri-surface-hover hover:border-kiri-accent transition-colors cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-kiri-text">{item.receptor} × {item.ligand}</span>
                        <span className="text-[10px] text-kiri-accent px-1.5 py-0.5 rounded-sm bg-kiri-accent/10 border border-kiri-accent/20">
                          {item.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-kiri-text-dim flex justify-between items-center mt-2">
                        <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-kiri-accent">
                          {t("modules.docking.view_details")} <span>→</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Results / Viewport */}
          <div className="lg:col-span-2 relative min-h-[500px] border border-kiri-border bg-kiri-surface rounded-xl overflow-hidden pointer-events-auto">
            <AnimatePresence mode="wait">
              {jobStatus ? (
                <motion.div
                  key="status"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full h-full flex flex-col"
                >
                  <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4 mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-kiri-text">{t("modules.docking.job_id", { id: jobStatus.job_id })}</h4>
                      <p className="text-xs text-kiri-text-muted mt-1">{jobStatus.message}</p>
                    </div>
                    <span className="px-3 py-1 bg-kiri-accent/20 text-kiri-accent border border-kiri-accent/30 rounded-full text-xs font-semibold uppercase tracking-wider">
                      {jobStatus.status} {jobStatus.progress !== undefined && jobStatus.status === "running" ? `(${Math.round(jobStatus.progress * 100)}%)` : ''}
                    </span>
                  </div>
                  
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    {["completed", "failed"].includes(jobStatus.status) ? (
                      jobStatus.status === "completed" ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-kiri-accent/20 flex items-center justify-center mb-4">
                            <span className="text-2xl">✅</span>
                          </div>
                          <p className="text-sm font-medium text-kiri-text">{t("modules.docking.success_msg")}</p>
                          <p className="text-xs text-kiri-text-dim mt-2 max-w-sm">{t("modules.docking.success_desc", { rec: receptorGene, lig: ligandGene })}</p>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                            <span className="text-2xl">❌</span>
                          </div>
                          <p className="text-sm font-medium text-red-400">{t("modules.docking.failed_msg")}</p>
                          <p className="text-xs text-kiri-text-dim mt-2 max-w-sm">{jobStatus.message}</p>
                        </>
                      )
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full border-4 border-kiri-border border-t-kiri-accent animate-spin mb-4" />
                        <p className="text-sm text-kiri-text-muted">{t("modules.docking.waiting_msg")}</p>
                        
                        {jobStatus.progress !== undefined && jobStatus.status === "running" && (
                          <div className="w-64 h-1.5 bg-kiri-border rounded-full mt-4 overflow-hidden">
                            <motion.div 
                              className="h-full bg-kiri-accent"
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.round(jobStatus.progress * 100)}%` }}
                              transition={{ ease: "linear" }}
                            />
                          </div>
                        )}
                        
                        <p className="text-xs text-kiri-text-dim mt-4 max-w-sm">{t("modules.docking.waiting_desc")}</p>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <div className="text-5xl mb-4 opacity-20">🧬</div>
                  <h3 className="text-lg font-semibold text-kiri-text-muted mb-1">
                    {t("modules.docking.empty_title")}
                  </h3>
                  <p className="text-sm text-kiri-text-dim max-w-sm">
                    {t("modules.docking.empty_desc")}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  );
}
