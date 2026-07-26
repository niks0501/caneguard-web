import { Link } from "react-router";
import { routes } from "../app/routes";

export function NotFoundPage() {
  return (
    <main className="not-found">
      <span>404</span>
      <h1>Page not found</h1>
      <p>The requested CaneGuard workspace page does not exist.</p>
      <Link className="button button--primary" to={routes.reports}>Return to submitted reports</Link>
    </main>
  );
}
