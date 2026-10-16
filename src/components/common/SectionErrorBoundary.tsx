import { Component, type ErrorInfo, type ReactNode } from "react";
interface Props {
  children: ReactNode;
  label?: string;
  resetKey?: string;
}
interface State {
  failed: boolean;
}
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    /* The other answer sections remain usable. */
  }
  componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render(): ReactNode {
    if (this.state.failed)
      return (
        <div
          role="alert"
          className="rounded-2xl border border-rose-800/50 bg-rose-950/20 p-4 text-sm text-rose-200"
        >
          تعذّر عرض {this.props.label || "هذا الجزء"}. بقيت بقية النتائج محفوظة.
          <button
            className="mr-3 underline"
            onClick={() => this.setState({ failed: false })}
          >
            إعادة العرض
          </button>
        </div>
      );
    return this.props.children;
  }
}
