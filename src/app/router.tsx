import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "../auth/RequireAuth";
import { AppShell } from "../components/layout/AppShell";
import { CaseReviewPage } from "../pages/CaseReviewPage";
import { ExpertQueuePage } from "../pages/ExpertQueuePage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoadingState } from "../components/ui/States";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { VerifyEmailPage } from "../pages/VerifyEmailPage";
import { SettingsPage } from "../pages/SettingsPage";
import { routes } from "./routes";
import { useAuth } from "../auth/useAuth";

function HomeRedirect() {
  const auth = useAuth();
  return <Navigate replace to={auth.user?.role === "expert" ? routes.expertQueue : routes.dashboard} />;
}

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
          <Route index element={<HomeRedirect />} />
          <Route element={<AppShell />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="expert/queue" element={<ExpertQueuePage />} />
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
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
