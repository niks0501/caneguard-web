import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { MemoryRouter, Route, Routes } from "react-router";
import { toApiError } from "../../api/ApiError";
import { axiosClient } from "../../api/axiosClient";
import { checkApiHealth } from "../../api/apiHealth";
import { ReportDocumentBuilder } from "./ReportDocumentBuilder";

vi.mock("../../api/apiHealth", () => ({
  checkApiHealth: vi.fn(),
}));

// Authentication is covered by the route guard and approval-component suites.
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ user: null }) }));

beforeEach(() => {
  vi.mocked(checkApiHealth).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderBuilder(onClose: () => void = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/reports"]}>
      <Routes>
        <Route path="/reports" element={<ReportDocumentBuilder open onClose={onClose} />} />
        <Route path="/dashboard" element={<p>Dashboard home</p>} />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReportDocumentBuilder", () => {
  it("surfaces API connection failures before loading a document preview", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({
      reachability: "unreachable",
      reason: "network",
    });
    renderBuilder();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Cannot connect to the CaneGuard API/);
    expect(screen.getByRole("button", { name: "Retry API connection" })).toBeInTheDocument();
    expect(screen.queryByTitle("Live report preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });

  it("explains a network failure from the PDF request itself", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({
      reachability: "reachable",
      checks: { database: "ready", storage: "ready" },
    });
    vi.spyOn(axiosClient, "get").mockRejectedValue(toApiError(new AxiosError("Network Error")));
    const user = userEvent.setup();
    renderBuilder();
    const download = screen.getByRole("button", { name: "Download PDF" });

    await waitFor(() => expect(download).toBeEnabled());
    await user.click(download);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Cannot connect to the CaneGuard API/);
  });

  it("distinguishes a reachable API with a failed PDF renderer", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({
      reachability: "reachable",
      checks: { database: "ready", storage: "ready" },
    });
    const rendererError = new AxiosError("PDF renderer unavailable");
    rendererError.response = {
      data: new Blob([JSON.stringify({
        message: "The PDF could not be generated.",
        code: "PDF_RENDER_FAILED",
      })], { type: "application/json" }),
      status: 503,
      statusText: "Service Unavailable",
      headers: {},
      config: {} as never,
    };
    const get = vi.spyOn(axiosClient, "get").mockRejectedValue(toApiError(rendererError));
    const user = userEvent.setup();
    renderBuilder();
    const download = screen.getByRole("button", { name: "Download PDF" });

    await waitFor(() => expect(download).toBeEnabled());
    await user.click(download);

    expect(await screen.findByRole("alert")).toHaveTextContent(/server-side PDF renderer is unavailable/i);
    expect(screen.getByText(/Dompdf installation/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/reports/documents/report/pdf?"),
      { responseType: "blob" },
    );
  });

  it("offers a return-to-home action that routes to the dashboard home", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({
      reachability: "reachable",
      checks: { database: "ready", storage: "ready" },
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderBuilder(onClose);

    const home = await screen.findByRole("button", { name: "Back to home" });
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();

    await user.click(home);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Dashboard home")).toBeInTheDocument();
  });
});
