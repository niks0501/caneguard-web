import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "../navigation/AppSidebar";
import { NeedsDecisionBanner } from "../ui/NeedsDecisionBanner";
import { BackToTop } from "./BackToTop";
import { Breadcrumbs } from "./Breadcrumbs";

const auth = vi.hoisted(() => ({ role: "reviewer" as "reviewer" | "admin" }));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { name: "Maria Santos", role: auth.role }, logout: vi.fn() }),
}));

describe("quiet shell sidebar", () => {
  it("names the four settled links and keeps their routes", () => {
    auth.role = "reviewer";
    render(<MemoryRouter><AppSidebar /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Workspace" });
    const links = within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["Home", "/dashboard"],
      ["Needs assessment", "/needs-assessment"],
      ["Reports", "/reports"],
      ["Visits", "/monitoring"],
      ["Settings", "/settings"],
    ]);
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Monitoring/ })).not.toBeInTheDocument();
  });

  it("keeps administration links for admins only", () => {
    auth.role = "admin";
    render(<MemoryRouter><AppSidebar /></MemoryRouter>);
    expect(screen.getByRole("group", { name: "Administration" })).toBeInTheDocument();
  });
});

describe("breadcrumbs", () => {
  const trail = (path: string) => {
    render(<MemoryRouter initialEntries={[path]}><Breadcrumbs /></MemoryRouter>);
    return screen.queryByRole("navigation", { name: "Breadcrumb" });
  };

  it("shows nothing on Home", () => {
    expect(trail("/dashboard")).toBeNull();
  });

  it("marks the current page on a section", () => {
    const nav = trail("/monitoring");
    expect(within(nav!).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav!).getByText("Visits")).toHaveAttribute("aria-current", "page");
  });

  it("links back to the section from a case", () => {
    const nav = trail("/reports/CG-2026-0718");
    expect(within(nav!).getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
    expect(within(nav!).getByText("CG-2026-0718")).toHaveAttribute("aria-current", "page");
  });
});

describe("back to top", () => {
  it("appears after scrolling and returns to the top", async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(<BackToTop />);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

    Object.defineProperty(window, "scrollY", { value: 900, configurable: true });
    fireEvent.scroll(window);
    await userEvent.click(await screen.findByRole("button", { name: "Back to top" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});

describe("needs decision banner", () => {
  it("moves focus to its target", async () => {
    render(
      <>
        <NeedsDecisionBanner targetId="decision" />
        <form id="decision" tabIndex={-1} />
      </>,
    );
    Element.prototype.scrollIntoView = vi.fn();
    await userEvent.click(screen.getByRole("button", { name: "Go to decision" }));
    expect(document.getElementById("decision")).toHaveFocus();
    expect(screen.getByText("Needs decision")).toBeInTheDocument();
  });
});
