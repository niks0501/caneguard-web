import { lazy, Suspense, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  type RouteObject,
} from "react-router";
import { RequireAuth } from "../auth/RequireAuth";
import { RequireAdmin } from "../auth/RequireAdmin";
import { RequireWebRole } from "../auth/RequireWebRole";
import { ReportApprovalPage } from "../pages/ReportApprovalPage";
import { AdminSettingsPage } from "../pages/AdminSettingsPage";
import { AccountsPage } from "../pages/AccountsPage";
import { AccountDetailPage } from "../pages/AccountDetailPage";
import { AppShell } from "../components/layout/AppShell";
import { CaseReviewPage } from "../pages/CaseReviewPage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoadingState } from "../components/ui/States";
import { UnsavedWorkProvider } from "../components/ui/UnsavedWorkGuard";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { MonitoringWorkspacePage } from "../pages/MonitoringWorkspacePage";
import { NeedsAssessmentPage } from "../pages/NeedsAssessmentPage";
import { LoginPage } from "../pages/LoginPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { VerifyEmailPage } from "../pages/VerifyEmailPage";
import { SettingsPage } from "../pages/SettingsPage";
import { routes } from "./routes";

const FieldValidationMapPage = lazy(() =>
  import("../pages/FieldValidationMapPage").then(({ FieldValidationMapPage }) => ({
    default: FieldValidationMapPage,
  })),
);

/**
 * A data router (not `<BrowserRouter>`) is required for `useBlocker`, which is
 * what makes the unsaved-work guard cover browser Back as well as in-app links.
 * `UnsavedWorkProvider` sits above every route so one dialog serves every draft.
 */
const appRoutes: RouteObject[] = [
  {
    element: (
      <UnsavedWorkProvider>
        <Outlet />
      </UnsavedWorkProvider>
    ),
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <Navigate replace to={routes.login} /> },
      { path: "verify-email", element: <VerifyEmailPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <Navigate replace to={routes.dashboard} /> },
          {
            element: <RequireWebRole />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { path: "dashboard", element: <DashboardPage /> },
                  {
                    path: "map",
                    element: (
                      <Suspense fallback={<LoadingState message="Loading the field-validation workspace..." />}>
                        <FieldValidationMapPage />
                      </Suspense>
                    ),
                  },
                  { path: "reports", element: <SubmittedReportsPage /> },
                  { path: "monitoring", element: <MonitoringWorkspacePage /> },
                  { path: "needs-assessment", element: <NeedsAssessmentPage /> },
                  { path: "reports/:reportId", element: <CaseReviewPage /> },
                  { path: "settings", element: <SettingsPage /> },
                  {
                    element: <RequireAdmin />,
                    children: [
                      { path: "report-approval", element: <ReportApprovalPage /> },
                      { path: "admin-settings", element: <AdminSettingsPage /> },
                      { path: "accounts", element: <AccountsPage /> },
                      { path: "accounts/:uuid", element: <AccountDetailPage /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export function AppRouter() {
  const [router] = useState(() => createBrowserRouter(appRoutes));
  return <RouterProvider router={router} />;
}
