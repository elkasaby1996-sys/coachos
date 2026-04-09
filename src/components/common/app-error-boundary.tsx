import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { Button } from "../ui/button";

type AppErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundaryInner extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App render failed", error, errorInfo);
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="surface-panel-strong w-full max-w-md rounded-[28px] border border-border/70 px-6 py-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/80">
              Repsync
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Refresh the page to try again. If the problem keeps happening,
              come back in a moment.
            </p>
            <Button
              className="mt-6"
              onClick={() => window.location.reload()}
              type="button"
            >
              Refresh page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <AppErrorBoundaryInner resetKey={location.pathname}>
      {children}
    </AppErrorBoundaryInner>
  );
}
