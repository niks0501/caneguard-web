import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiseaseReport } from "../../domain/report.types";
import { useReports } from "../../hooks/useReports";
import { ReportPicker } from "./ReportPicker";

vi.mock("../../hooks/useReports", () => ({
  useReports: vi.fn(),
}));

function pickerReport(overrides: Partial<DiseaseReport> = {}): DiseaseReport {
  return {
    uuid: "target-report-uuid",
    referenceCode: "CG-2026-0007",
    barangay: "Balaytigui",
    submittedByName: "Ana Reporter",
    submittedAt: "2026-08-12T10:00:00.000Z",
    predictedDisease: "rust",
    ...overrides,
  } as DiseaseReport;
}

function listResult(reports: DiseaseReport[], overrides: Record<string, unknown> = {}) {
  return {
    data: {
      reports,
      meta: {
        currentPage: 1,
        from: reports.length ? 1 : null,
        lastPage: 1,
        perPage: 8,
        to: reports.length || null,
        total: reports.length,
      },
    },
    error: null,
    isError: false,
    isPending: false,
    isFetching: false,
    isSuccess: true,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useReports>;
}

beforeEach(() => {
  vi.mocked(useReports).mockReturnValue(listResult([]));
});

describe("ReportPicker", () => {
  it("narrows results as the user types", async () => {
    const user = userEvent.setup();
    const mabini = pickerReport();
    const other = pickerReport({
      uuid: "other-report-uuid",
      referenceCode: "CG-2026-0009",
      barangay: "Calayo",
    });
    vi.mocked(useReports).mockImplementation((filters) => {
      const search = (filters?.search ?? "").toLowerCase();
      const reports = [mabini, other].filter((report) =>
        !search ||
        report.referenceCode.toLowerCase().includes(search) ||
        report.barangay.toLowerCase().includes(search),
      );
      return listResult(reports);
    });
    const onSelect = vi.fn();
    render(<ReportPicker value={null} onSelect={onSelect} />);

    await user.click(screen.getByRole("combobox", { name: "Search cases" }));
    expect(await screen.findByRole("option", { name: /CG-2026-0007/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /CG-2026-0009/ })).toBeInTheDocument();

    await user.type(screen.getByRole("combobox", { name: "Search cases" }), "Balaytigui");
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /CG-2026-0007/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /CG-2026-0009/ })).not.toBeInTheDocument();
    });
  });

  it("selects a case with the keyboard and renders the reference-code chip", async () => {
    const user = userEvent.setup();
    const target = pickerReport();
    vi.mocked(useReports).mockReturnValue(listResult([target]));
    const onSelect = vi.fn();
    const { rerender } = render(<ReportPicker value={null} onSelect={onSelect} />);

    const search = screen.getByRole("combobox", { name: "Search cases" });
    await user.click(search);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith({
      uuid: target.uuid,
      label: expect.stringContaining("CG-2026-0007"),
    });

    rerender(
      <ReportPicker
        value={{ uuid: target.uuid, label: "CG-2026-0007 · Barangay Balaytigui · Aug 12, 2026" }}
        onSelect={onSelect}
      />,
    );
    const chip = screen.getByTestId("report-picker-selection");
    expect(within(chip).getByText(/CG-2026-0007/)).toBeInTheDocument();
    expect(within(chip).getByText(target.uuid)).toBeInTheDocument();

    await user.click(within(chip).getByRole("button", { name: "Clear selected case" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("excludes the case under review from the results", async () => {
    const user = userEvent.setup();
    const current = pickerReport({ uuid: "current-report", referenceCode: "CG-2026-0001" });
    const other = pickerReport();
    vi.mocked(useReports).mockReturnValue(listResult([current, other]));
    render(<ReportPicker value={null} onSelect={vi.fn()} excludeUuid="current-report" />);

    await user.click(screen.getByRole("combobox", { name: "Search cases" }));
    expect(await screen.findByRole("option", { name: /CG-2026-0007/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /CG-2026-0001/ })).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    vi.mocked(useReports).mockReturnValue(listResult([]));
    render(<ReportPicker value={null} onSelect={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search cases" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/No cases match this search/);
  });

  it("shows an error state when the search fails", async () => {
    const user = userEvent.setup();
    vi.mocked(useReports).mockReturnValue(
      listResult([], { data: undefined, error: new Error("offline"), isError: true }),
    );
    render(<ReportPicker value={null} onSelect={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search cases" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Case search is unavailable/);
  });

  it("closes the list with Escape without selecting", async () => {
    const user = userEvent.setup();
    vi.mocked(useReports).mockReturnValue(listResult([pickerReport()]));
    const onSelect = vi.fn();
    render(<ReportPicker value={null} onSelect={onSelect} />);

    await user.click(screen.getByRole("combobox", { name: "Search cases" }));
    expect(await screen.findByRole("option", { name: /CG-2026-0007/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option", { name: /CG-2026-0007/ })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
