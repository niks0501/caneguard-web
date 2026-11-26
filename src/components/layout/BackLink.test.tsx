import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { BackLink } from "./BackLink";
import {
  previousSection,
  resetNavigationOrigin,
  sectionLabelForPath,
  trackLocation,
} from "./navigationOrigin";

function visit(key: string, pathname: string, search = "") {
  trackLocation({ key, pathname, search });
}

function renderBackLink(props: Parameters<typeof BackLink>[0], state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/monitoring", state }]}>
      <BackLink {...props} />
    </MemoryRouter>,
  );
}

describe("navigation origin", () => {
  beforeEach(resetNavigationOrigin);

  it("names top-level pages only", () => {
    expect(sectionLabelForPath("/dashboard")).toBe("Home");
    expect(sectionLabelForPath("/monitoring/")).toBe("Field visits");
    expect(sectionLabelForPath("/reports/abc")).toBeNull();
  });

  it("labels monitoring views only when the search names one", () => {
    expect(sectionLabelForPath("/monitoring")).toBe("Field visits");
    expect(sectionLabelForPath("/monitoring", "?view=boundaries")).toBe("Field maps");
    expect(sectionLabelForPath("/monitoring", "?view=map")).toBe("Monitoring Map");
    expect(sectionLabelForPath("/monitoring", "?view=register")).toBe("Field visits");
  });

  it("records a move between monitoring views as the previous page", () => {
    visit("a", "/monitoring", "?view=map");
    visit("b", "/monitoring", "?view=boundaries");
    expect(previousSection()).toMatchObject({ pathname: "/monitoring", search: "?view=map" });
    visit("c", "/monitoring", "?view=boundaries&boundary=2");
    expect(previousSection()).toMatchObject({ search: "?view=map" });
  });

  it("remembers the previous page, ignoring same-page changes and repeats", () => {
    visit("a", "/monitoring", "?view=map");
    visit("b", "/reports/123");
    visit("b", "/reports/123");
    visit("c", "/reports/123", "?x=1");
    expect(previousSection()).toEqual({ pathname: "/monitoring", search: "?view=map", label: "Field visits" });
  });

  it("does not offer a detail page as an origin", () => {
    visit("a", "/reports/1");
    visit("b", "/reports/2");
    expect(previousSection()).toBeNull();
  });
});

describe("BackLink", () => {
  beforeEach(resetNavigationOrigin);

  it("returns to the page the user came from, keeping its filters", () => {
    visit("a", "/dashboard");
    visit("b", "/reports/1");
    renderBackLink({ fallback: { to: "/reports", label: "Cases" } });
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/dashboard");
  });

  it("prefers an explicit target, then falls back", () => {
    visit("a", "/dashboard");
    visit("b", "/reports/1");
    renderBackLink({ preferred: { to: "/todo", label: "To do" }, fallback: { to: "/reports", label: "Cases" } });
    expect(screen.getByRole("link", { name: "Back to To do" })).toHaveAttribute("href", "/todo");
  });

  it("uses a safe return context from router state after preferred, before the tracked origin", () => {
    visit("a", "/dashboard");
    visit("b", "/reports/1");
    const returnContext = { to: "/reports/9?x=1", label: "Back to Case 9" };
    renderBackLink({ fallback: { to: "/reports", label: "Cases" } }, { returnContext });
    expect(screen.getByRole("link", { name: "Back to Case 9" })).toHaveAttribute("href", "/reports/9?x=1");
  });

  it("ignores an unsafe return context and respects accepts", () => {
    visit("a", "/dashboard");
    visit("b", "/reports/1");
    renderBackLink({ fallback: { to: "/reports", label: "Cases" } }, { returnContext: { to: "//evil.com", label: "X" } });
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeInTheDocument();
  });

  it("uses the fallback when the origin is not accepted", () => {
    visit("a", "/dashboard");
    visit("b", "/accounts/1");
    renderBackLink({ fallback: { to: "/accounts", label: "User Management" }, accepts: (p) => p === "/accounts" });
    expect(screen.getByRole("link", { name: "Back to User Management" })).toHaveAttribute("href", "/accounts");
  });

  it("renders nothing without any target", () => {
    renderBackLink({});
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
