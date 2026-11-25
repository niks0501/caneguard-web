import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { routes } from "../../app/routes";
import caneGuardLogo from "../../assets/brand/cane_guard_logo.png";
import caneGuardLogoOnDark from "../../assets/brand/cane_guard_logo_onDark.png";
import { useAuth } from "../../auth/useAuth";
import {
  enterPublicTheme,
  leavePublicTheme,
} from "../../theme/publicThemePreference";
import { usePublicTheme } from "../../theme/usePublicTheme";
import { PublicThemeToggle } from "./PublicThemeToggle";

const sectionLinks = [
  { hash: "what", label: "Sugarcane" },
  { hash: "growth", label: "Growth" },
  { hash: "guide", label: "Field Guide" },
  { hash: "quiz", label: "Quiz" },
  { hash: "history", label: "History" },
  { hash: "legacy", label: "Legacy" },
] as const;

/**
 * Shell for the public pages (`/`, `/guide`, `/guide/:entryId`).
 *
 * It paints the public theme on `<html>` while mounted and hands the document
 * back to the workspace theme when it unmounts, so the two themes never leak
 * into each other (see `publicThemePreference.ts`).
 */
export function PublicLayout() {
  const auth = useAuth();
  const theme = usePublicTheme();
  const location = useLocation();

  useEffect(() => {
    enterPublicTheme();
    return leavePublicTheme;
  }, []);

  // A single-page navigation keeps the scroll position, so scroll to the
  // requested section or back to the top.
  useEffect(() => {
    const id = location.hash.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (target) {
      target.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  const signedIn = auth.status === "authenticated";

  return (
    <div className="pub-page">
      <a className="skip-link" href="#pub-main">
        Skip to content
      </a>
      <header className="pub-nav">
        <Link className="pub-nav__brand" to={routes.home}>
          <img
            src={theme === "dark" ? caneGuardLogoOnDark : caneGuardLogo}
            alt=""
            aria-hidden="true"
          />
          <span>CaneGuard</span>
        </Link>
        <nav className="pub-nav__links" aria-label="Page sections">
          {sectionLinks.map((link) => (
            <Link key={link.hash} to={`${routes.home}#${link.hash}`}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="pub-nav__end">
          <PublicThemeToggle />
          <Link
            className="button button--secondary"
            to={signedIn ? routes.dashboard : routes.login}
          >
            {signedIn ? "Open workspace" : "Staff sign in"}
          </Link>
        </div>
      </header>
      <main id="pub-main" className="pub-main">
        <Outlet />
      </main>
      <footer className="pub-footer">
        <p>
          CaneGuard, SRA Don Pedro Mill District Office. CaneGuard output is
          decision support, not a diagnosis. Report a suspected problem to your
          SRA district office.
        </p>
        <p>
          <Link to={routes.guide}>Field Guide</Link>
          {" · "}
          <Link to={signedIn ? routes.dashboard : routes.login}>
            {signedIn ? "Open workspace" : "Staff sign in"}
          </Link>
        </p>
      </footer>
    </div>
  );
}
