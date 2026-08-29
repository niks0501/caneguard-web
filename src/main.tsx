import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/redesign.css";
import "./styles/t12-work-first.css";
import App from "./App";
import { AppProviders } from "./app/AppProviders";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
