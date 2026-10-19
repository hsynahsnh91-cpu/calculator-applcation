import type { VerificationEvidence } from "../semantic/statement";

export interface NumericRuleInput {
  left: string;
  right: string;
  variables: string[];
  assumptionsLatex?: string[];
  samples?: number;
  seed?: string;
  tolerance?: number;
}

export interface NumericVerificationResult {
  evidence: VerificationEvidence;
  tested: number;
  counterexample?: Record<string, number>;
}

export interface SymbolicVerificationResult {
  evidence: VerificationEvidence;
  normalizedDifference?: string;
}
