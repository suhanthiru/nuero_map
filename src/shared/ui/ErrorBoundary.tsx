import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** What to show instead; `reset` tries rendering the children again. */
  readonly fallback: (error: Error, reset: () => void) => ReactNode;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/** Keeps one broken view (an editor, a tab) from taking the whole window down with it. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("A view failed to render", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
