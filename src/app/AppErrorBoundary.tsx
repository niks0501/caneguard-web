import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The application could not render.", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-render-fallback" role="alert">
          <h1>CaneGuard could not display this page</h1>
          <p>Refresh the page to try again. Your account is still signed in.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
