import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Mail,
  Smartphone,
  Trash2,
  User,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/ApiError";
import { useAuth } from "../auth/useAuth";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/States";
import { formatDateTime } from "../lib/formatters";
import {
  changeEmail,
  changePassword,
  listMobileDevices,
  revokeMobileDevice,
} from "../services/account.api";

export function SettingsPage() {
  const auth = useAuth();
  const user = auth.user;

  useEffect(() => {
    document.title = "Account settings | CaneGuard";
  }, []);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Email state
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  // Device status state
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceSuccess, setDeviceSuccess] = useState<string | null>(null);

  // Mobile devices query
  const devicesQuery = useQuery({
    queryKey: ["account", "devices"],
    queryFn: listMobileDevices,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeMobileDevice,
    onSuccess: (data) => {
      void devicesQuery.refetch();
      setDeviceSuccess(data.message || "Device revoked successfully.");
      setDeviceError(null);
    },
    onError: (error) => {
      setDeviceError(
        error instanceof ApiError ? error.message : "Failed to revoke mobile device.",
      );
      setDeviceSuccess(null);
    },
  });

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("The new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }

    try {
      const result = await changePassword({
        currentPassword,
        password: newPassword,
        passwordConfirmation: confirmPassword,
      });
      setPasswordSuccess(result.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(
        error instanceof ApiError ? error.message : "Failed to update password.",
      );
    }
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!emailPassword) {
      setEmailError("Enter your current password to verify your identity.");
      return;
    }
    if (!newEmail || !newEmail.includes("@")) {
      setEmailError("Enter a valid new email address.");
      return;
    }

    try {
      const result = await changeEmail({
        currentPassword: emailPassword,
        email: newEmail,
      });
      setEmailSuccess(
        result.message ||
          "Email updated. Verify the new address before signing in again.",
      );
      setEmailPassword("");
      setNewEmail("");
    } catch (error) {
      setEmailError(
        error instanceof ApiError ? error.message : "Failed to update email address.",
      );
    }
  };

  const handleRevoke = (deviceId: number) => {
    if (
      window.confirm(
        "Are you sure you want to revoke this mobile device? The inspector will be signed out immediately.",
      )
    ) {
      revokeMutation.mutate(deviceId);
    }
  };

  const roleLabel =
    user?.role === "admin"
      ? "Administrator"
      : user?.role === "expert"
        ? "Expert"
        : "Reviewer";

  return (
    <PageContent className="settings-page">
      <PageHeader
        title="Account settings"
        description="View your authorized account profile, update credentials, and manage connected mobile inspection devices."
      />

      <div className="settings-layout">
        {/* Profile Sidebar */}
        <aside className="settings-sidebar">
          <section className="settings-card settings-card--profile" aria-labelledby="profile-heading">
            <div className="section-heading">
              <div>
                <h2 id="profile-heading">Account profile</h2>
              </div>
              <User aria-hidden="true" />
            </div>

            <div className="settings-profile-header">
              <div className="avatar avatar--large" aria-hidden="true">
                {user?.name ? user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "CG"}
              </div>
              <div className="settings-profile-identity">
                <span className="settings-profile-name">Active account</span>
                <span className="settings-profile-status">Authorized workspace access</span>
              </div>
            </div>

            <dl className="detail-list settings-detail-list">
              <DetailField label="Full name">{user?.name ?? "Unavailable"}</DetailField>
              <DetailField label="Email address">{user?.email ?? "Unavailable"}</DetailField>
              <DetailField label="Assigned role">{roleLabel}</DetailField>
              <DetailField label="User ID">
                <span className="machine-text settings-uid">{user?.uuid ?? "Unavailable"}</span>
              </DetailField>
            </dl>

            <div className="settings-auth-note">
              <span className="settings-auth-note__title">SRA Don Pedro Workspace</span>
              <span className="settings-auth-note__text">Role privileges are managed by office administrators.</span>
            </div>
          </section>
        </aside>

        {/* Credentials and Security Section */}
        <div className="settings-security-group">
          {/* Change Password Card */}
          <section className="settings-card settings-card--form" aria-labelledby="password-heading">
            <div className="section-heading">
              <div>
                <h2 id="password-heading">Change password</h2>
              </div>
              <KeyRound aria-hidden="true" />
            </div>

            {passwordError ? (
              <div className="govuk-error-summary" role="alert" tabIndex={-1}>
                <h2 className="govuk-error-summary__title">There is a problem</h2>
                <div className="govuk-error-summary__body">
                  <ul className="govuk-error-summary__list">
                    <li>{passwordError}</li>
                  </ul>
                </div>
              </div>
            ) : null}

            {passwordSuccess ? (
              <div className="settings-alert settings-alert--success" role="status">
                <CheckCircle2 aria-hidden="true" />
                <span>{passwordSuccess}</span>
              </div>
            ) : null}

            <form onSubmit={handlePasswordSubmit} className="settings-form">
              <label className="settings-field">
                <span>Current password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>

              <div className="settings-field-row">
                <label className="settings-field">
                  <span>New password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>

                <label className="settings-field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
              </div>

              <div className="settings-form__actions">
                <Button type="submit">Update password</Button>
              </div>
            </form>
          </section>

          {/* Change Email Card */}
          <section className="settings-card settings-card--form" aria-labelledby="email-heading">
            <div className="section-heading">
              <div>
                <h2 id="email-heading">Change email address</h2>
              </div>
              <Mail aria-hidden="true" />
            </div>

            {emailError ? (
              <div className="govuk-error-summary" role="alert" tabIndex={-1}>
                <h2 className="govuk-error-summary__title">There is a problem</h2>
                <div className="govuk-error-summary__body">
                  <ul className="govuk-error-summary__list">
                    <li>{emailError}</li>
                  </ul>
                </div>
              </div>
            ) : null}

            {emailSuccess ? (
              <div className="settings-alert settings-alert--success" role="status">
                <CheckCircle2 aria-hidden="true" />
                <span>{emailSuccess}</span>
              </div>
            ) : null}

            <form onSubmit={handleEmailSubmit} className="settings-form">
              <div className="settings-field-row">
                <label className="settings-field">
                  <span>Current password (for verification)</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    required
                  />
                </label>

                <label className="settings-field">
                  <span>New email address</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="settings-form__actions">
                <Button type="submit">Update email</Button>
              </div>
            </form>
          </section>
        </div>

        {/* Mobile Devices Card */}
        <section className="settings-card settings-card--wide" aria-labelledby="devices-heading">
          <div className="section-heading">
            <div>
              <h2 id="devices-heading">Connected mobile devices</h2>
            </div>
            <Smartphone aria-hidden="true" />
          </div>

          <p className="settings-card__description">
            Active Android field-inspection devices enrolled under this account. Revoking a device immediately invalidates its offline sync token.
          </p>

          {deviceError ? (
            <div className="govuk-error-summary" role="alert" tabIndex={-1}>
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <div className="govuk-error-summary__body">
                <ul className="govuk-error-summary__list">
                  <li>{deviceError}</li>
                </ul>
              </div>
            </div>
          ) : null}

          {deviceSuccess ? (
            <div className="settings-alert settings-alert--success" role="status">
              <CheckCircle2 aria-hidden="true" />
              <span>{deviceSuccess}</span>
            </div>
          ) : null}

          {devicesQuery.isLoading ? (
            <LoadingState message="Loading enrolled devices..." />
          ) : devicesQuery.isError ? (
            <div className="settings-alert settings-alert--error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span>Failed to load registered mobile devices.</span>
            </div>
          ) : devicesQuery.data && devicesQuery.data.length > 0 ? (
            <div className="table-scroll">
              <table className="report-table device-table">
                <thead>
                  <tr>
                    <th scope="col">Device name</th>
                    <th scope="col">Device ID</th>
                    <th scope="col">Registered</th>
                    <th scope="col">Last active</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devicesQuery.data.map((device) => (
                    <tr key={device.id}>
                      <td>
                        <strong>{device.deviceName}</strong>
                        {device.isCurrent ? (
                          <span className="current-device-tag"> (Current session)</span>
                        ) : null}
                      </td>
                      <td>
                        <span className="machine-text">{device.deviceId ?? "Not recorded"}</span>
                      </td>
                      <td>{device.createdAt ? formatDateTime(device.createdAt) : "Unknown"}</td>
                      <td>{device.lastUsedAt ? formatDateTime(device.lastUsedAt) : "Never"}</td>
                      <td>
                        <Button
                          type="button"
                          variant="danger"
                          icon={<Trash2 aria-hidden="true" />}
                          disabled={revokeMutation.isPending}
                          onClick={() => handleRevoke(device.id)}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="settings-empty">No mobile inspection devices are currently enrolled.</p>
          )}
        </section>
      </div>
    </PageContent>
  );
}
