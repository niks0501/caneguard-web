import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AppProviders } from "./app/AppProviders";
import { initializeTheme } from "./theme/themePreference";

// Seed the appearance store from the same stored choice the inline script in
// index.html already painted, so every later theme read agrees with the page.
initializeTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
