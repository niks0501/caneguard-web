import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AppErrorFallback } from "./app/AppErrorBoundary";
import { initializeTheme } from "./theme/themePreference";

// Seed the appearance store from the same stored choice the inline script in
// index.html already painted, so every later theme read agrees with the page.
initializeTheme();

const root = createRoot(document.getElementById('root')!);

// The app modules read the environment when they load, so import them here:
// a bad environment value then shows the fallback instead of a blank page.
Promise.all([import("./App"), import("./app/AppProviders")])
  .then(([{ default: App }, { AppProviders }]) => {
    root.render(
      <StrictMode>
        <AppProviders>
          <App />
        </AppProviders>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("The application could not start.", error);
    root.render(<AppErrorFallback />);
  });
