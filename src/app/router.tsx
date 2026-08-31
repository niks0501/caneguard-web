import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "../auth/RequireAuth";
import { AppShell } from "../components/layout/AppShell";
import { CaseReviewPage } from "../pages/CaseReviewPage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoadingState } from "../components/ui/States";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { VerifyEmailPage } from "../pages/VerifyEmailPage";
import { routes } from "./routes";

const FieldValidationMapPage = lazy(() =>
  import("../pages/FieldValidationMapPage").then(({ FieldValidationMapPage }) => ({
    default: FieldValidationMapPage,
  })),
);

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<Navigate replace to={routes.dashboard} />} />
          <Route element={<AppShell />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route
              path="map"
              element={(
                <Suspense fallback={<LoadingState message="Loading the field-validation workspace..." />}>
                  <FieldValidationMapPage />
                </Suspense>
              )}
            />
            <Route path="reports" element={<SubmittedReportsPage />} />
            <Route path="reports/:reportId" element={<CaseReviewPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
