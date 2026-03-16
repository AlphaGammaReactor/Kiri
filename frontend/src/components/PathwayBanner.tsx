/**
 * Kiri — Pathway Context Banner
 *
 * Horizontal strip showing the PARL-MAVS regulatory axis.
 * Nodes are clickable to select proteins; the active pair is highlighted.
 * Animated signal flow arrow connecting the pathway steps.
 */

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

interface PathwayStep {
  gene: string;
  role: string;
  label: string;
}

interface PathwayModulator {
  gene: string;
  role: string;
  target: string;
  effect: string;
}

interface PathwayAxis {
  id: string;
  name: string;
  steps: PathwayStep[];
  modulator: PathwayModulator;
}

interface PathwayBannerProps {
  axis: PathwayAxis | null;
  selectedPair: { geneA: string; geneB: string } | null;
  onGeneClick: (gene: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  sensor: "#f5a623",
  adaptor: "#00bbf9",
  transcription_factor: "#7c5cfc",
  effector: "#2ecc71",
  protease: "#e74c3c",
};

export function PathwayBanner({
  axis,
  selectedPair,
  onGeneClick,
}: PathwayBannerProps) {
  const { t } = useTranslation();

  if (!axis) return null;

  const isSelected = (gene: string) =>
    selectedPair &&
    (selectedPair.geneA === gene || selectedPair.geneB === gene);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-kiri-surface border border-kiri-border rounded-lg px-5 py-3"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-kiri-text-muted uppercase tracking-wider">
          {t("modules.interaction.pathway_axis")}
        </h3>
        <span className="text-[10px] text-kiri-text-dim font-mono">
          {axis.name}
        </span>
      </div>

      <div className="flex items-center justify-center gap-1">
        {/* Main pathway steps */}
        {axis.steps.map((step, i) => (
          <div key={step.gene} className="flex items-center gap-1">
            <button
              onClick={() => onGeneClick(step.gene)}
              className={`
                relative px-3 py-1.5 rounded-md text-xs font-mono font-bold
                transition-all duration-200 cursor-pointer
                ${
                  isSelected(step.gene)
                    ? "ring-2 ring-kiri-accent scale-105 shadow-lg shadow-kiri-accent/20"
                    : "hover:scale-105"
                }
              `}
              style={{
                backgroundColor: isSelected(step.gene)
                  ? ROLE_COLORS[step.role] + "30"
                  : ROLE_COLORS[step.role] + "15",
                color: ROLE_COLORS[step.role],
                borderWidth: 1,
                borderColor: ROLE_COLORS[step.role] + "40",
              }}
            >
              {step.label}
              <span className="block text-[9px] opacity-60 font-normal mt-0.5">
                {t(`modules.interaction.roles.${step.role}`)}
              </span>
            </button>

            {/* Arrow between steps */}
            {i < axis.steps.length - 1 && (
              <motion.svg
                width="28"
                height="16"
                viewBox="0 0 28 16"
                className="text-kiri-text-dim shrink-0"
              >
                <motion.line
                  x1="2"
                  y1="8"
                  x2="20"
                  y2="8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: i * 0.15, duration: 0.4 }}
                />
                <motion.polygon
                  points="18,4 26,8 18,12"
                  fill="currentColor"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.15 + 0.3 }}
                />
              </motion.svg>
            )}
          </div>
        ))}

        {/* Modulator (PARL) shown as a branch */}
        <div className="ml-4 pl-4 border-l border-kiri-border flex items-center gap-2">
          <svg width="20" height="30" viewBox="0 0 20 30" className="text-kiri-error shrink-0">
            <line x1="10" y1="2" x2="10" y2="22" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
            <polygon points="6,20 14,20 10,28" fill="currentColor" />
          </svg>
          <button
            onClick={() => onGeneClick(axis.modulator.gene)}
            className={`
              px-3 py-1.5 rounded-md text-xs font-mono font-bold
              transition-all duration-200 cursor-pointer
              ${
                isSelected(axis.modulator.gene)
                  ? "ring-2 ring-kiri-error scale-105 shadow-lg shadow-kiri-error/20"
                  : "hover:scale-105"
              }
            `}
            style={{
              backgroundColor: isSelected(axis.modulator.gene) ? "#e74c3c30" : "#e74c3c15",
              color: "#e74c3c",
              borderWidth: 1,
              borderColor: "#e74c3c40",
            }}
          >
            {axis.modulator.gene}
            <span className="block text-[9px] opacity-60 font-normal mt-0.5">
              {t(`modules.interaction.roles.${axis.modulator.role}`)}
            </span>
          </button>
          <span className="text-[10px] text-kiri-error/70 font-mono">
            {t("modules.interaction.cleaves")} {axis.modulator.target}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
