import { RichText, Tex } from "./Tex";
import type { SolutionStep } from "../core/solver/types";
export function Step({ step, number }: { step: SolutionStep; number: number }) {
  return (
    <div className="solution-step">
      <div className="step-heading">
        <span className="step-number">{number}</span>
        <h4>{step.title}</h4>
      </div>
      {step.text && (
        <p className="step-explanation">
          <RichText text={step.text} />
        </p>
      )}
      <div className="step-math">
        <Tex display math={step.latex} />
      </div>
    </div>
  );
}
