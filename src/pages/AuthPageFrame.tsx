import type { ReactNode } from "react";
import { Link } from "react-router";
import { routes } from "../app/routes";
import caneGuardLogo from "../assets/brand/cane_guard_logo.png";
import caneGuardLogoOnDark from "../assets/brand/cane_guard_logo_onDark.png";
import { useTheme } from "../theme/useTheme";

interface AuthPageFrameProps {
  headingId: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}

export function AuthPageFrame({
  headingId,
  eyebrow,
  title,
  description,
  icon,
  children,
}: AuthPageFrameProps) {
  const theme = useTheme();

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby={headingId}>
        <div className="login-brand">
          <span className="brand__mark">
            <img
              src={theme === "dark" ? caneGuardLogoOnDark : caneGuardLogo}
              alt=""
              aria-hidden="true"
            />
          </span>
          <div>
            <strong>CaneGuard</strong>
            <span>SRA Don Pedro Mill District Office</span>
          </div>
        </div>

        <div className="login-copy">
          <span className="login-icon">{icon}</span>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id={headingId}>{title}</h1>
          <p>{description}</p>
        </div>

        {children}

        <p className="login-support">
          <Link to={routes.login}>Return to staff sign in</Link>
        </p>
      </section>
      <aside className="login-visual" aria-label="CaneGuard decision support">
        <div>
          <img
            src={caneGuardLogoOnDark}
            alt="CaneGuard"
            className="login-visual__mark"
          />
          <p className="eyebrow">{eyebrow}</p>
          <h2>Turn field observations into timely SRA Don Pedro follow-up.</h2>
          <p>
            Securely review submitted evidence, coordinate validation, and keep
            sugarcane monitoring work visible.
          </p>
        </div>
      </aside>
    </main>
  );
}
