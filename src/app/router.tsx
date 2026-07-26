import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "../auth/RequireAuth";
import { AppShell } from "../components/layout/AppShell";
import { CaseReviewPage } from "../pages/CaseReviewPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { LoginPage } from "../pages/LoginPage";
import { routes } from "./routes";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<Navigate replace to={routes.dashboard} />} />
          <Route
            path="dashboard"
            element={<Navigate replace to={routes.reports} />}
          />
          <Route element={<AppShell />}>
            <Route path="reports" element={<SubmittedReportsPage />} />
            <Route path="reports/:reportId" element={<CaseReviewPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
