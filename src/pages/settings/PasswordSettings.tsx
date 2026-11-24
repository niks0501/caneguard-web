import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { ApiError } from "../../api/ApiError";
import { Button } from "../../components/ui/Button";
import { PasswordInput } from "../../components/ui/FormControls";
import { changePassword } from "../../services/account.api";

export function PasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isPasswordSubmitting, setPasswordSubmitting] = useState(false);

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPasswordSubmitting) return;
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if ([...newPassword].length < 15) {
      setPasswordError("The new password must be at least 15 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }

    setPasswordSubmitting(true);
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
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="password-heading">
      <div className="section-heading">
        <h2 id="password-heading">Change password</h2>
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
          <PasswordInput
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>

        <div className="settings-field-row">
          <label className="settings-field">
            <span>New password</span>
            <PasswordInput
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={15}
              required
            />
          </label>

          <label className="settings-field">
            <span>Confirm new password</span>
            <PasswordInput
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={15}
              required
            />
          </label>
        </div>

        <div className="settings-form__actions">
          <Button type="submit" disabled={isPasswordSubmitting}>
            {isPasswordSubmitting ? "Updating password..." : "Update password"}
          </Button>
        </div>
      </form>
    </section>
  );
}
