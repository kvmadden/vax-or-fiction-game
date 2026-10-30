import { Component, ErrorInfo, ReactNode } from "react";
import { tapPrimary } from "../engine/audio-cues";

export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  resetKey?: any;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetKey: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    resetKey: this.props.resetKey,
  };

  public static getDerivedStateFromError(error: Error): Pick<ErrorBoundaryState, "hasError" | "error"> {
    return { hasError: true, error };
  }

  public static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    return state.resetKey === props.resetKey
      ? null
      : { hasError: false, error: null, resetKey: props.resetKey };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => {
    tapPrimary();
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(
          this.state.error || new Error("Unknown error"),
          this.handleReset
        );
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            backgroundColor: "var(--color-stage-deep)",
            color: "var(--color-ink)",
            fontFamily: "var(--kit-font-sans)",
            padding: "var(--kit-space-24)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-panel-navy)",
              padding: "var(--kit-space-48)",
              borderRadius: "var(--kit-radius-16)",
              border: "1px solid var(--color-hairline)",
              maxWidth: "600px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <h1 style={{ color: "var(--color-vax)", marginBottom: "var(--kit-space-12)", marginTop: 0 }}>
              Something went wrong.
            </h1>
            <p style={{ color: "var(--color-ink-dim)", marginBottom: "var(--kit-space-24)" }}>
              {this.state.error?.message || "An unexpected error occurred in the application."}
            </p>
            <button
              type="button"
              className="facilitator-press"
              onClick={this.handleReload}
              style={{
                backgroundColor: "var(--color-vax)",
                color: "var(--color-stage-deep)",
                border: "none",
                borderRadius: "var(--kit-space-8)",
                padding: "var(--kit-space-8) var(--kit-space-24)",
                minHeight: "var(--kit-touch)",
                fontSize: "16px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Reload the page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface SlideErrorBoundaryProps {
  children?: ReactNode;
  resetKey?: any;
  onSkip?: () => void;
}

export class SlideErrorBoundary extends Component<SlideErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    resetKey: this.props.resetKey,
  };

  public static getDerivedStateFromError(error: Error): Pick<ErrorBoundaryState, "hasError" | "error"> {
    return { hasError: true, error };
  }

  public static getDerivedStateFromProps(
    props: SlideErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    return state.resetKey === props.resetKey
      ? null
      : { hasError: false, error: null, resetKey: props.resetKey };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("SlideErrorBoundary caught error:", error, errorInfo);
  }

  private handleSkip = () => {
    tapPrimary();
    this.setState({ hasError: false, error: null });
    if (this.props.onSkip) {
      this.props.onSkip();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          data-role="slide-error-boundary"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            minHeight: "100vh",
            backgroundColor: "var(--color-stage-deep)",
            color: "var(--color-ink)",
            fontFamily: "var(--kit-font-sans)",
            padding: "var(--kit-space-24)",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-panel-navy)",
              padding: "var(--kit-space-32)",
              borderRadius: "var(--kit-radius-16)",
              border: "1px solid var(--color-hairline)",
              maxWidth: "560px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontFamily: "var(--kit-font-mono)",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-gold)",
                marginBottom: "var(--kit-space-8)",
              }}
            >
              SLIDE ERROR RECOVERY
            </div>
            <h2
              style={{
                color: "var(--color-ink)",
                fontSize: "24px",
                fontWeight: 700,
                marginTop: 0,
                marginBottom: "var(--kit-space-8)",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                color: "var(--color-ink-dim)",
                fontSize: "16px",
                lineHeight: 1.5,
                marginTop: 0,
                marginBottom: "var(--kit-space-16)",
              }}
            >
              Something went wrong. Press S to skip this slide.
            </p>
            {this.state.error && (
              <p
                style={{
                  color: "var(--color-ink-muted)",
                  fontSize: "12px",
                  fontFamily: "var(--kit-font-mono)",
                  backgroundColor: "color-mix(in srgb, var(--color-void) 25%, transparent)",
                  padding: "var(--kit-space-8)",
                  borderRadius: "var(--kit-space-4)",
                  marginTop: 0,
                  marginBottom: "var(--kit-space-16)",
                  overflowWrap: "break-word",
                  maxHeight: "80px",
                  overflowY: "auto",
                }}
              >
                {this.state.error.message}
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--kit-space-8)", justifyContent: "center" }}>
              <button
                type="button"
                className="facilitator-press"
                onClick={this.handleSkip}
                style={{
                  backgroundColor: "var(--color-gold)",
                  color: "var(--color-stage-deep)",
                  border: "none",
                  borderRadius: "var(--kit-space-8)",
                  padding: "0 var(--kit-space-24)",
                  minHeight: "var(--kit-touch)",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--kit-space-4)",
                }}
              >
                <span>Skip this slide</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
