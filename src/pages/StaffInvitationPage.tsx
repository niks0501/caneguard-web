import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { ApiError } from "../api/ApiError";
import { acceptStaffInvitation } from "../auth/auth.api";
import { AccessConfiguration } from "../components/AccessConfiguration";
import { Button } from "../components/ui/Button";
import { AuthPageFrame } from "./AuthPageFrame";

export function StaffInvitationPage() {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [isAccepted, setAccepted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Keep the secret out of navigation history and subsequent copied URLs.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await acceptStaffInvitation({ token, email, current_password: password });
      setToken("");
      setPassword("");
      setAccepted(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setErrorMessage("Invitation not accepted. Check your verified email and password, or request a new invitation from the office.");
      } else if (error instanceof ApiError && error.status === 422) {
        setErrorMessage("Check the invitation code, email and password.");
      } else if (error instanceof ApiError && error.status === 429) {
        setErrorMessage("Too many attempts. Wait a minute and try again.");
      } else {
        setErrorMessage("The service could not confirm acceptance. Contact the office before retrying.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageFrame
      headingId="invitation-heading"
      eyebrow="Approved staff access"
      title="Accept your staff invitation"
      description="Use the verified account listed on the approved office roster. An invitation activates only the staff role approved for that account."
      icon={<UserCheck aria-hidden="true" />}
    >
      <AccessConfiguration />
      {isAccepted ? (
        <p className="auth-success" role="status">Staff account certified. Sign in again to use your approved access.</p>
      ) : (
        <form className="login-form auth-form" onSubmit={submit}>
          {errorMessage ? <p className="login-notice login-notice--error" role="alert">{errorMessage}</p> : null}
          <label>
            <span>Invitation code</span>
            <input type="password" name="invitation" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value.trim())} minLength={64} maxLength={64} required />
          </label>
          <label>
            <span>Verified email</span>
            <input type="email" name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span>Current password</span>
            <input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Accepting invitation..." : "Accept invitation"}</Button>
        </form>
      )}
    </AuthPageFrame>
  );
}
