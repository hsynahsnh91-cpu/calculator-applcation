import { DocumentScanner, type DocumentAnalysisOptions } from "../DocumentScanner";
import { ManualTrainingPanel, type ManualTrainingInput } from "../ManualTrainingPanel";
import type { ScannedDocument } from "../scanner";

export function ScanTab({
  onAnalyze,
  onSaveManualTraining,
}: {
  onAnalyze: (document: ScannedDocument, options?: DocumentAnalysisOptions) => Promise<void>;
  onSaveManualTraining: (input: ManualTrainingInput) => Promise<void>;
}) {
  return (
    <>
      <DocumentScanner onAnalyze={onAnalyze} />
      <ManualTrainingPanel onSave={onSaveManualTraining} />
    </>
  );
}
