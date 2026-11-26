import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import { checkApiHealth } from "../api/apiHealth";
import { printableScopeFromReportFilters, printableScopeToSearch } from "../components/reports/reportBuilderScope";
import { PrintableReportsPage } from "./PrintableReportsPage";

vi.mock("../api/apiHealth", () => ({ checkApiHealth: vi.fn() }));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: null }) }));

beforeEach(() => {
  vi.mocked(checkApiHealth).mockResolvedValue({
    reachability: "reachable",
    checks: { database: "ready", storage: "ready" },
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname}{location.search}</output>;
}

function renderPage(entry = "/reports/print") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <PrintableReportsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PrintableReportsPage", () => {
  it("opens the unified weekly reports hub first with two clean workspace entries", () => {
    renderPage();

    const group = screen.getByRole("group", { name: "Report workspace" });
    expect(group.querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Weekly reports" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Custom list" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Weekly reports" })).toBeInTheDocument();
  });

  it("switches cleanly between weekly reports and custom list", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Custom list" }));
    expect(screen.getByRole("region", { name: "Custom list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom list" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Weekly reports" }));
    expect(screen.getByRole("region", { name: "Weekly reports" })).toBeInTheDocument();
  });

  it("keeps the arriving work scope in the URL when switching from legacy type=rssi to Custom list", async () => {
    const user = userEvent.setup();
    renderPage("/reports/print?type=rssi&barangay=Bacoor&queue=needs_review&from=2026-08-01&to=2026-08-31");

    await user.click(screen.getByRole("button", { name: "Custom list" }));

    expect(screen.getByLabelText("Current URL")).toHaveTextContent("type=custom");
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("barangay=Bacoor");
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("queue=needs_review");
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("from=2026-08-01");
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("to=2026-08-31");
    expect(screen.getByLabelText("Barangay")).toHaveValue("Bacoor");
    expect(screen.getByLabelText("Operational queue")).toHaveValue("needs_review");
  });

  it("shows skipped work-scope items from the generated report URL", () => {
    const scope = printableScopeFromReportFilters({ workflowStatus: "field_validation" });
    renderPage(`/reports/print${printableScopeToSearch(scope)}`);

    expect(screen.getByLabelText("Printable report scope")).toHaveTextContent("Not carried into this document: Status.");
  });

  it("drops and names a retired staff condition arriving in the URL", () => {
    renderPage("/reports/print?type=custom&authority_classified_condition=downy_mildew");

    expect(screen.getByLabelText("Staff condition")).toHaveValue("");
    expect(screen.getByLabelText("Staff condition").querySelector('option[value="downy_mildew"]')).toBeNull();
    expect(screen.getByLabelText("Printable report scope")).toHaveTextContent("Not carried into this document: Staff condition: Outside current scope.");
  });
});
