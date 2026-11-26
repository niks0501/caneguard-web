import {
  Navigate,
  Outlet,
  type RouteObject,
} from "react-router";
import { RequireAuth } from "../auth/RequireAuth";
import { RequireAdmin } from "../auth/RequireAdmin";
import { RequireWebRole } from "../auth/RequireWebRole";
import { PrintableReportsPage } from "../pages/PrintableReportsPage";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { AdminSettingsPage } from "../pages/AdminSettingsPage";
import { AccountsPage } from "../pages/AccountsPage";
import { AccountDetailPage } from "../pages/AccountDetailPage";
import { AppShell } from "../components/layout/AppShell";
import { CaseReviewPage } from "../pages/CaseReviewPage";
import { DashboardPage } from "../pages/DashboardPage";
import { UnsavedWorkProvider } from "../components/ui/UnsavedWorkGuard";
import { NotFoundPage } from "../pages/NotFoundPage";
import { MonitoringWorkspacePage } from "../pages/MonitoringWorkspacePage";
import { TodoPage } from "../pages/TodoPage";
import { FarmerBroadcastsPage } from "../pages/FarmerBroadcastsPage";
import { LoginPage } from "../pages/LoginPage";
import { LandingPage } from "../pages/LandingPage";
import { GuidePage } from "../pages/GuidePage";
import { GuideEntryPage } from "../pages/GuideEntryPage";
import { PublicLayout } from "../components/public/PublicLayout";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { VerifyEmailPage } from "../pages/VerifyEmailPage";
import { SettingsPage } from "../pages/SettingsPage";
import { AppearanceSettings } from "../pages/settings/AppearanceSettings";
import { DevicesSettings } from "../pages/settings/DevicesSettings";
import { EmailSettings } from "../pages/settings/EmailSettings";
import { PasswordSettings } from "../pages/settings/PasswordSettings";
import { ProfileSettings } from "../pages/settings/ProfileSettings";
import { AerialAnalysisSettings } from "../components/reports/AerialAnalysisSettings";
import { WeeklyReportingSettings } from "../components/reports/WeeklyReportingSettings";
import { AppErrorFallback } from "./AppErrorBoundary";
import { LegacyMapRedirect } from "./LegacyMapRedirect";
import { routes } from "./routes";

/**
 * A data router (not `<BrowserRouter>`) is required for `useBlocker`, which is
 * what makes the unsaved-work guard cover browser Back as well as in-app links.
 * `UnsavedWorkProvider` sits above every route so one dialog serves every draft.
 */
export const appRoutes: RouteObject[] = [
  {
    errorElement: <AppErrorFallback />,
    element: (
      <UnsavedWorkProvider>
        <Outlet />
      </UnsavedWorkProvider>
    ),
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <LandingPage /> },
          { path: "guide", element: <GuidePage /> },
          { path: "guide/:entryId", element: <GuideEntryPage /> },
        ],
      },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <Navigate replace to={routes.login} /> },
      { path: "verify-email", element: <VerifyEmailPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireWebRole />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { path: "dashboard", element: <DashboardPage /> },
                  { path: "map", element: <LegacyMapRedirect /> },
                  { path: "reports", element: <SubmittedReportsPage /> },
                  { path: "reports/print", element: <PrintableReportsPage /> },
                  { path: "monitoring", element: <MonitoringWorkspacePage /> },
                  { path: "todo", element: <TodoPage /> },
                  { path: "needs-assessment", element: <Navigate replace to={routes.todo} /> },
                  { path: "farmer-broadcasts", element: <FarmerBroadcastsPage /> },
                  { path: "reports/:reportId", element: <CaseReviewPage /> },
                  {
                    path: "settings",
                    element: <SettingsPage />,
                    children: [
                      { index: true, element: <Navigate replace to={routes.settingsSection("profile")} /> },
                      { path: "profile", element: <ProfileSettings /> },
                      { path: "appearance", element: <AppearanceSettings /> },
                      { path: "password", element: <PasswordSettings /> },
                      { path: "email", element: <EmailSettings /> },
                      { path: "devices", element: <DevicesSettings /> },
                      {
                        element: <RequireAdmin />,
                        children: [
                          { path: "weekly-reporting", element: <WeeklyReportingSettings /> },
                          { path: "aerial-analysis", element: <AerialAnalysisSettings /> },
                          { path: "official-recipients", element: <Navigate replace to={routes.settingsSection("weekly-reporting")} /> },
                        ],
                      },
                    ],
                  },
                  {
                    element: <RequireAdmin />,
                    children: [
                      { path: "report-approval", element: <Navigate replace to={routes.printableReports} /> },
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
