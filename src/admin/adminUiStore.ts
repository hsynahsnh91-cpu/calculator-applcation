import type { KnowledgeItem, KnowledgeItemType, RegressionOutcome } from "./types";

export type AdminTab =
  | "overview"
  | "scan"
  | "practice"
  | "library"
  | "publish"
  | "monitor"
  | "settings";
export type SessionState = "checking" | "anonymous" | "authenticated";

export interface CorrectionTarget {
  item: KnowledgeItem;
  wrongSolution?: KnowledgeItem["approvedSolution"];
}

export interface IncomingFeedback {
  question: string;
  answerText: string;
  answerLatex: string;
  isCorrect: boolean;
  createdAt: string;
}

/**
 * Ephemeral administration UI state. Knowledge itself stays in IndexedDB and
 * Redis; keeping this reducer separate lets tab modules share one state model
 * without each tab inventing a disconnected copy.
 */
export interface AdminUiState {
  session: SessionState;
  tab: AdminTab;
  notice: string;
  error: string;
  workspaceBusy: boolean;
  correctionTarget: CorrectionTarget | null;
  incomingFeedback: IncomingFeedback | null;
  libraryQuery: string;
  libraryType: KnowledgeItemType | "all";
  libraryStatus: KnowledgeItem["status"] | "all";
  libraryGrade: string;
  libraryUnit: string;
  editing: KnowledgeItem | null;
  regressionBusy: boolean;
  publishing: boolean;
  publishFailures: RegressionOutcome[];
  publishMessage: string;
}

export type AdminUiAction = { patch: Partial<AdminUiState> };

export function adminUiReducer(
  state: AdminUiState,
  action: AdminUiAction,
): AdminUiState {
  return { ...state, ...action.patch };
}

export const initialAdminUiState: AdminUiState = {
  session: "checking",
  tab: "overview",
  notice: "",
  error: "",
  workspaceBusy: false,
  correctionTarget: null,
  incomingFeedback: null,
  libraryQuery: "",
  libraryType: "all",
  libraryStatus: "all",
  libraryGrade: "all",
  libraryUnit: "all",
  editing: null,
  regressionBusy: false,
  publishing: false,
  publishFailures: [],
  publishMessage: "",
};
