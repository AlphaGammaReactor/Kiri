import { useTranslation } from "react-i18next";
import { KaplanMeierPlot } from "./KaplanMeierPlot";

interface SurvivalCurveData {
  group_name: string;
  n_samples: number;
  median_survival: number | null;
  time: number[];
  survival: number[];
  ci_lower: number[];
  ci_upper: number[];
}

interface SynergyPanelProps {
  geneA: string;
  geneB: string;
  interactionPValue: number;
  combinedHr: number;
  synergyType: string;
  curves: SurvivalCurveData[];
  atRiskTable: {
    time_points: number[];
    groups: Record<string, number[]>;
  };
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

export function SynergyPanel({
  geneA,
  geneB,
  interactionPValue,
  combinedHr,
  synergyType,
  curves,
  atRiskTable,
  dataSource,
  citation,
}: SynergyPanelProps) {
  const { t } = useTranslation();

  // Helper to get color based on synergy type
  const getTypeColor = () => {
    switch (synergyType) {
      case "synergistic":
        return "text-kiri-success bg-kiri-success/10 border-kiri-success/20";
      case "antagonistic":
        return "text-kiri-error bg-kiri-error/10 border-kiri-error/20";
      case "additive":
        return "text-kiri-info bg-kiri-info/10 border-kiri-info/20";
      default:
        return "text-kiri-text-muted bg-kiri-surface-hover border-kiri-border";
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-kiri-surface border border-kiri-border rounded-lg p-5 flex flex-col justify-center items-center text-center">
          <p className="text-sm text-kiri-text-muted uppercase tracking-wider mb-2">
            {t("clinical.synergy.interaction_p")}
          </p>
          <div className={`text-3xl font-bold font-mono ${interactionPValue < 0.05 ? 'text-kiri-accent' : 'text-kiri-text'}`}>
            {interactionPValue.toExponential(2)}
          </div>
          <div className="text-xs text-kiri-text-dim mt-2">
            {geneA} × {geneB}
          </div>
        </div>

        <div className="bg-kiri-surface border border-kiri-border rounded-lg p-5 flex flex-col justify-center items-center text-center">
          <p className="text-sm text-kiri-text-muted uppercase tracking-wider mb-2">
            {t("clinical.synergy.combined_hr")}
          </p>
          <div className="text-3xl font-bold text-kiri-text font-mono">
            {combinedHr.toFixed(2)}
          </div>
        </div>

        <div className="bg-kiri-surface border border-kiri-border rounded-lg p-5 flex flex-col justify-center items-center text-center">
          <p className="text-sm text-kiri-text-muted uppercase tracking-wider mb-2">
            {t("clinical.synergy.type")}
          </p>
          {/* Using t(`clinical.synergy.types.${synergyType}`) correctly maps to dictionary */}
          <div className={`px-4 py-1.5 rounded-full border text-lg font-bold font-mono tracking-wide ${getTypeColor()}`}>
            {t(`clinical.synergy.types.${synergyType}`)}
          </div>
        </div>
      </div>

      {/* 4-way KM Plot */}
      <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4">
        <h3 className="text-lg font-bold text-kiri-text mb-4 px-2">
          {t("clinical.synergy.title")}
        </h3>
        <KaplanMeierPlot 
          curves={curves} 
          p_value={interactionPValue} 
          at_risk_table={atRiskTable}
          dataSource={dataSource}
          citation={citation}
        />
      </div>
    </div>
  );
}
