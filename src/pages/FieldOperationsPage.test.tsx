import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReports } from "../data/mock/mockReports";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReports, useUpdateReportReview } from "../hooks/useReports";
import { FieldOperationsPage } from "./FieldOperationsPage";

vi.mock("../hooks/useFieldReporters", () => ({ useFieldReporters: vi.fn() }));
vi.mock("../hooks/useReports", () => ({ useReports: vi.fn(), useUpdateReportReview: vi.fn() }));

function result<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}

describe("FieldOperationsPage", () => {
  beforeEach(() => {
    const report = {
      ...mockReports[1],
      reviewVersion: 4,
      lifecycle: { caseState: "open", verificationOutcome: "not_determined", fieldValidationState: "assigned", referralState: "not_referred" },
    };
    vi.mocked(useReports).mockReturnValue(result({ reports: [report], meta: { total: 1 } }));
    vi.mocked(useFieldReporters).mockReturnValue(result([
      { uuid: "00000000-0000-4000-8000-000000000100", name: "Maria Santos" },
      { uuid: "inspector-2", name: "Inspector Two" },
    ]));
    vi.mocked(useUpdateReportReview).mockReturnValue(result(undefined, { mutateAsync: vi.fn().mockResolvedValue(report), isPending: false }));
  });

  it("shows active visits and saves a reassignment through the review mutation", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(mockReports[1]);
    vi.mocked(useUpdateReportReview).mockReturnValue(result(undefined, { mutateAsync, isPending: false }));
    render(<MemoryRouter initialEntries={["/monitoring?view=field-operations"]}><FieldOperationsPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Active visits" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Inspector"), "inspector-2");
    await user.click(screen.getByRole("button", { name: /Assign visit|Reassign visit/ }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: "inspector-2",
      expectedVersion: 4,
    }));
  });
});
