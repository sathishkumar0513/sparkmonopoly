import { Component, type ErrorInfo, type ReactNode } from "react";

interface GameDebugInfo {
  seed: number | string;
  lastActions: Array<{
    type: string;
    playerId: string | null;
    details: Record<string, unknown>;
  }>;
  appVersion: string;
}

interface GameErrorBoundaryProps {
  children: ReactNode;
  debugInfo: GameDebugInfo;
  title: string;
  description: string;
  reloadLabel: string;
  copyLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
}

interface GameErrorBoundaryState {
  error: Error | null;
  copyStatus: "idle" | "copied" | "failed";
}

export class GameErrorBoundary extends Component<
  GameErrorBoundaryProps,
  GameErrorBoundaryState
> {
  state: GameErrorBoundaryState = { error: null, copyStatus: "idle" };

  static getDerivedStateFromError(error: Error): GameErrorBoundaryState {
    return { error, copyStatus: "idle" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("The game screen encountered a rendering error.", error, info.componentStack);
  }

  private copyDebugInfo = async (): Promise<void> => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable.");
      }
      await navigator.clipboard.writeText(JSON.stringify({
        ...this.props.debugInfo,
        error: {
          name: this.state.error?.name,
          message: this.state.error?.message,
        },
      }, null, 2));
      this.setState({ copyStatus: "copied" });
    } catch (error) {
      console.error("Could not copy game debug information.", error);
      this.setState({ copyStatus: "failed" });
    }
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const copyText = this.state.copyStatus === "copied"
      ? this.props.copiedLabel
      : this.state.copyStatus === "failed"
        ? this.props.copyFailedLabel
        : this.props.copyLabel;

    return (
      <main className="game-error-panel" role="alert">
        <div className="game-error-card">
          <span className="eyebrow">Business Tycoon</span>
          <h1>{this.props.title}</h1>
          <p>{this.props.description}</p>
          <div className="game-error-actions">
            <button className="primary-button" onClick={() => window.location.reload()}>
              {this.props.reloadLabel}
            </button>
            <button className="secondary-button" onClick={() => void this.copyDebugInfo()}>
              {copyText}
            </button>
          </div>
        </div>
      </main>
    );
  }
}
