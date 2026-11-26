import { Link } from "react-router";
import { routes } from "../app/routes";

export type SignInSurface = "mobile" | "web";
export type LocaleHint = "tl" | "en";

type HandoffKind = "reset" | "verify";

const copy: Record<LocaleHint, Record<HandoffKind, { title: string; detail: string }> & { steps: string[]; note: string }> = {
  tl: {
    reset: {
      title: "Na-save na ang iyong bagong password.",
      detail: "Isinara ang lahat ng dating session.",
    },
    verify: {
      title: "Na-verify na ang iyong email.",
      detail: "Handa na ang iyong account.",
    },
    steps: [
      "Buksan ang CaneGuard Mobile sa iyong Android phone.",
      "Mag-sign in gamit ang iyong email at ang password na ginawa mo.",
    ],
    note: "Sa mobile app ginagamit ang account na ito, hindi sa web office.",
  },
  en: {
    reset: {
      title: "Your new password is saved.",
      detail: "All earlier sessions were signed out.",
    },
    verify: {
      title: "Your email is verified.",
      detail: "Your account is ready.",
    },
    steps: [
      "Open the CaneGuard Mobile app on your Android phone.",
      "Sign in with your email and the password you just chose.",
    ],
    note: "This account uses the mobile app, not the web office.",
  },
};

/**
 * Role-correct completion for a proven auth link. Mobile accounts are never
 * sent to the web sign-in, which rejects them.
 */
export function SignInHandoff({
  kind,
  surface,
  locale = "en",
}: {
  kind: HandoffKind;
  surface: SignInSurface | undefined;
  locale?: LocaleHint;
}) {
  if (surface === "mobile") {
    const text = copy[locale];
    return (
      <div className="auth-success" role="status" lang={locale}>
        <strong>{text[kind].title}</strong>
        <span>{text[kind].detail}</span>
        <ol className="auth-success__steps">
          {text.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <span>{text.note}</span>
      </div>
    );
  }

  return (
    <div className="auth-success" role="status">
      <strong>{kind === "reset" ? "Password updated." : "Your email is verified."}</strong>
      <span>
        {kind === "reset"
          ? "All existing sessions were signed out. Sign in again with the new password."
          : "You can now sign in to continue."}
      </span>
      <Link className="button button--primary" to={routes.login}>
        Return to sign in
      </Link>
    </div>
  );
}
