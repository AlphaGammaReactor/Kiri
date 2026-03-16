
import { AlertTriangle, ExternalLink, CheckCircle } from "lucide-react";
import { Badge, Card } from "../ui";

interface CitationCardProps {
  text: string;
  verifiedPmids: string[];
  isQuarantined: boolean;
  confidence: number;
}

export function CitationCard({
  text,
  verifiedPmids,
  isQuarantined,
  confidence,
}: CitationCardProps) {
  return (
    <Card
      className={`relative overflow-hidden ${
        isQuarantined
          ? "border-kiri-error/50 bg-kiri-error/5"
          : "border-kiri-info/20 bg-kiri-info/5"
      }`}
    >
      <div className="absolute top-0 right-0 p-3">
        {isQuarantined ? (
          <Badge variant="error" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Quarantined (Invalid PMIDs)
          </Badge>
        ) : (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Verified
          </Badge>
        )}
      </div>

      <div className="p-4 pt-8">
        <p className="text-kiri-text text-sm mb-4 leading-relaxed">{text}</p>

        <div className="mt-4 pt-4 border-t border-kiri-border flex items-center justify-between">
          <div className="flex gap-2">
            {verifiedPmids.map((pmid) => (
              <a
                key={pmid}
                href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-kiri-info hover:brightness-110 flex items-center gap-1 transition-colors bg-kiri-info/10 px-2 py-1 rounded"
              >
                PMID: {pmid}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-kiri-text-muted">Confidence:</span>
            <span
              className={`font-mono ${
                confidence > 0.8
                  ? "text-kiri-success"
                  : confidence > 0.5
                  ? "text-kiri-warning"
                  : "text-kiri-error"
              }`}
            >
              {(confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
