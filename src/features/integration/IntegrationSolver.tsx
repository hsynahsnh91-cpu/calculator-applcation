import { ResultVisuals, type ResultViewProps } from '../chat/ResultVisuals';

// Internal, presentational result renderer. Inputs and solving live in src/solver.
export function IntegrationSolver({ result }: ResultViewProps) {
  return <ResultVisuals result={result} />;
}
export default IntegrationSolver;
