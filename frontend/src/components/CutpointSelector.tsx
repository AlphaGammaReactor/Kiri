import { useTranslation } from "react-i18next";

export type CutpointMethod = "maxstat" | "median" | "custom";

interface CutpointSelectorProps {
  value: CutpointMethod;
  onChange: (value: CutpointMethod) => void;
  customValue: number | undefined;
  onCustomValueChange: (value: number | undefined) => void;
}

export function CutpointSelector({
  value,
  onChange,
  customValue,
  onCustomValueChange,
}: CutpointSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-kiri-text">
        {t("clinical.cutpoint.label")}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["maxstat", "median", "custom"] as const).map((method) => (
          <label
            key={method}
            className={`flex flex-col gap-1 p-3 rounded border cursor-pointer transition-colors ${
              value === method
                ? "bg-kiri-accent-glow border-kiri-accent text-kiri-text"
                : "border-kiri-border hover:border-kiri-border-focus text-kiri-text-muted"
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="cutpoint"
                value={method}
                checked={value === method}
                onChange={() => onChange(method)}
                className="accent-kiri-accent"
              />
              <span className="text-sm font-medium">
                {t(`clinical.cutpoint.${method}`)}
              </span>
            </div>
            <p className="text-xs text-kiri-text-dim mt-1 pl-6">
              {t(`clinical.cutpoint.${method}_desc`)}
            </p>
          </label>
        ))}
      </div>

      {value === "custom" && (
        <div className="pt-2 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <label className="text-sm text-kiri-text-muted">
            {t("clinical.cutpoint.custom")}:
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={customValue ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onCustomValueChange(isNaN(val) ? undefined : val);
            }}
            placeholder="TPM/FPKM"
            className="w-32 bg-kiri-bg border border-kiri-border rounded px-3 py-1.5 text-sm text-kiri-text focus:outline-none focus:border-kiri-accent transition-colors"
          />
        </div>
      )}
    </div>
  );
}
