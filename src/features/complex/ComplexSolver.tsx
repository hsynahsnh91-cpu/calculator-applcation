import { ResultVisuals, type ResultViewProps } from '../chat/ResultVisuals';

// Internal, presentational result renderer. Inputs and solving live in src/solver.
export function ComplexSolver({ result }: ResultViewProps) {
  return <ResultVisuals result={result} />;
}
export default ComplexSolver;
