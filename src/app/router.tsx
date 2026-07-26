import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppShell } from "../components/layout/AppShell";
import { CaseReviewPage } from "../pages/CaseReviewPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { routes } from "./routes";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to={routes.reports} />} />
          <Route path="reports" element={<SubmittedReportsPage />} />
          <Route path="reports/:reportId" element={<CaseReviewPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
