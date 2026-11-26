import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useAppSelector } from "../store";
import type { RootState } from "../store";
import { InfoTooltip, Stat } from "../components/ui";
import { NotAvailableNotice } from "../components/NotAvailableNotice";

export default function ProteinDocking() {
  const { t } = useTranslation();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);

  const projectGenes = useMemo(
    () => activeProject?.proteins?.map((p) => p.gene_symbol) ?? [],
    [activeProject?.proteins]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 space-y-6 max-w-[1400px] mx-auto"
    >
      <div className="flex items-start justify-between border-b border-kiri-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            {t("nav.docking")}
            <InfoTooltip tooltipKey="tooltips.docking" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("modules.docking.subtitle", "Run high-confidence protein-protein docking models and refine complexes.")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {projectGenes.length > 0 && (
            <Stat label="Proteins" value={projectGenes.join(", ")} />
          )}
        </div>
      </div>

      {/* Kiri has no docking engine yet. Earlier builds showed a simulated result here. */}
      <NotAvailableNotice title={t("modules.docking.not_available_title")}>
        <p>{t("modules.docking.not_available_body")}</p>
      </NotAvailableNotice>
    </motion.div>
  );
}
