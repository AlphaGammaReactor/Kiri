import { motion } from "framer-motion";

interface ConfidenceScoreBarProps {
  score: number; // 0 to 1
  label?: string;
}

export function ConfidenceScoreBar({ score, label = "AI Confidence" }: ConfidenceScoreBarProps) {
  const percentage = Math.max(0, Math.min(100, score * 100));

  let colorClass = "bg-kiri-success";
  if (percentage < 50) colorClass = "bg-kiri-error";
  else if (percentage < 80) colorClass = "bg-kiri-warning";

  return (
    <div className="flex flex-col gap-1 w-full mt-2">
      <div className="flex justify-between text-xs text-kiri-text-muted">
        <span>{label}</span>
        <span className="font-mono">{percentage.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full bg-kiri-surface-hover rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full ${colorClass}`}
        />
      </div>
    </div>
  );
}
