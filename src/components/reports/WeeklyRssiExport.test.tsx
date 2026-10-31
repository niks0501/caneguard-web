import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { WeeklyRssiExport, type WeeklyRssiReportPeriod } from "./WeeklyRssiExport";

const weekly: WeeklyRssiReportPeriod = {
  periodType: "weekly",
  week: "2026-W40",
  month: "",
  from: "",
  to: "",
};

function stubDownload() {
  const createObjectURL = vi.fn(() => "blob:rssi-export");
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });

  return { createObjectURL, downloads };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WeeklyRssiExport", () => {
  it("downloads the CSV for the selected week from the RSSI export endpoint", async () => {
    const { downloads } = stubDownload();
    const get = vi.spyOn(axiosClient, "get").mockResolvedValue({
      data: new Blob(["report_section,case_reference\n"], { type: "text/csv" }),
    });
    const user = userEvent.setup();
    render(<WeeklyRssiExport period={weekly} />);

    await user.click(screen.getByRole("button", { name: "Download RSSI CSV" }));

    const requestedUrl = String(get.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/api/v1/reports/rssi-weekly/export?");
    expect(requestedUrl).toContain("period_type=weekly");
    expect(requestedUrl).toContain("week=2026-W40");
    expect(requestedUrl).toContain("format=csv");
    expect(get).toHaveBeenCalledWith(expect.any(String), { responseType: "blob" });
    expect(downloads).toEqual(["caneguard-rssi-weekly-2026-W40.csv"]);
  });

  it("asks for the PDF when the PDF download is chosen", async () => {
    stubDownload();
    const get = vi.spyOn(axiosClient, "get").mockResolvedValue({
      data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    });
    const user = userEvent.setup();
    render(<WeeklyRssiExport period={weekly} />);

    await user.click(screen.getByRole("button", { name: "Download RSSI PDF" }));

    expect(String(get.mock.calls[0]?.[0])).toContain("format=pdf");
    await waitFor(() => expect(screen.getByRole("button", { name: "Download RSSI PDF" })).toBeEnabled());
  });

  it("states the fixed scope and that infestation percentage is not reported", () => {
    render(<WeeklyRssiExport period={weekly} />);

    expect(screen.getByText(/reviewed and validated RSSI cases for week 2026-W40/i)).toBeInTheDocument();
    expect(screen.getByText(/suspected RSSI cases are listed separately/i)).toBeInTheDocument();
    expect(screen.getByText(/Farmer and farm names are not included/i)).toBeInTheDocument();
    expect(screen.getByText(/Infestation percentage is not reported/i)).toBeInTheDocument();
  });

  it("keeps the downloads closed until a complete period is chosen", () => {
    render(<WeeklyRssiExport period={{ ...weekly, week: "" }} />);

    expect(screen.getByRole("button", { name: "Download RSSI PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download RSSI CSV" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/complete reporting period/i);
  });

  it("stays disabled while the API cannot be reached", () => {
    render(<WeeklyRssiExport period={weekly} disabled />);

    expect(screen.getByRole("button", { name: "Download RSSI PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download RSSI CSV" })).toBeDisabled();
  });

  it("explains a network failure instead of downloading an empty file", async () => {
    const { downloads } = stubDownload();
    vi.spyOn(axiosClient, "get").mockRejectedValue(toApiError(new AxiosError("Network Error")));
    const user = userEvent.setup();
    render(<WeeklyRssiExport period={weekly} />);

    await user.click(screen.getByRole("button", { name: "Download RSSI CSV" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/CaneGuard cannot be reached right now/);
    expect(downloads).toEqual([]);
  });

  it("points at the CSV when the PDF renderer fails", async () => {
    stubDownload();
    const rendererError = new AxiosError("PDF renderer unavailable");
    rendererError.response = {
      data: new Blob([JSON.stringify({
        message: "The PDF could not be generated. The CSV export is still available.",
        code: "PDF_RENDER_FAILED",
      })], { type: "application/json" }),
      status: 503,
      statusText: "Service Unavailable",
      headers: {},
      config: {} as never,
    };
    vi.spyOn(axiosClient, "get").mockRejectedValue(toApiError(rendererError));
    const user = userEvent.setup();
    render(<WeeklyRssiExport period={weekly} />);

    await user.click(screen.getByRole("button", { name: "Download RSSI PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Download the RSSI CSV instead/);
  });
});
