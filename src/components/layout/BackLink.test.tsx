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

function renderBackLink(props: Parameters<typeof BackLink>[0]) {
  render(
    <MemoryRouter>
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
