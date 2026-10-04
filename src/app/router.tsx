import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "../auth/RequireAuth";
import { AppShell } from "../components/layout/AppShell";
import { CaseReviewPage } from "../pages/CaseReviewPage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoadingState } from "../components/ui/States";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { MonitoringWorkspacePage } from "../pages/MonitoringWorkspacePage";
import { NeedsAssessmentPage } from "../pages/NeedsAssessmentPage";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { VerifyEmailPage } from "../pages/VerifyEmailPage";
import { SettingsPage } from "../pages/SettingsPage";
import { routes } from "./routes";
import { isPublicRegistrationEnabled } from "./publicRegistration";

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
        <Route
          path="register"
          element={isPublicRegistrationEnabled() ? <RegisterPage /> : <Navigate replace to={routes.login} />}
        />
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
            <Route path="monitoring" element={<MonitoringWorkspacePage />} />
            <Route path="needs-assessment" element={<NeedsAssessmentPage />} />
            <Route path="reports/:reportId" element={<CaseReviewPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
