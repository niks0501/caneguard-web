import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { AppRouter } from "./app/router";

export default function App() {
  return (
    <AppErrorBoundary>
      <AppRouter />
    </AppErrorBoundary>
  );
}
