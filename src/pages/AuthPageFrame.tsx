import type { ReactNode } from "react";
import { Sprout } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../app/routes";

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
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby={headingId}>
        <div className="login-brand">
          <span className="brand__mark">
            <Sprout aria-hidden="true" />
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
