import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { MemoryRouter, Route, Routes } from "react-router";
import { toApiError } from "../../api/ApiError";
import { axiosClient } from "../../api/axiosClient";
import { checkApiHealth } from "../../api/apiHealth";
import { useState } from "react";
import { env } from "../../config/env";
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

    expect(await screen.findByRole("alert")).toHaveTextContent(/CaneGuard cannot be reached right now/);
    expect(screen.getByRole("button", { name: "Retry connection" })).toBeInTheDocument();
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

    expect(await screen.findByRole("alert")).toHaveTextContent(/CaneGuard cannot be reached right now/);
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

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/PDF service could not produce a file/i);
    expect(alert).not.toHaveTextContent(/Dompdf/);
    expect(alert).toHaveTextContent(/HTML preview remains available|report preview is available/i);
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

describe("ReportDocumentBuilder document scope", () => {
  const scope = {
    filters: {
      queue: "needs_review",
      predicted_label: "rust",
      barangay: "Bacoor",
      case_state: "",
      verification_outcome: "",
      field_validation_state: "",
      authority_classified_condition: "",
    },
    removed: ["Field Inspector", "Map location"],
  };

  it("starts the printable report from the current work scope and names what it cannot carry", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    renderBuilderWithScope(scope);

    const summary = await screen.findByLabelText("Printable report scope");
    expect(summary).toHaveTextContent("Queue: Needs Review");
    expect(summary).toHaveTextContent("Barangay: Bacoor");
    expect(summary).toHaveTextContent("Possible Condition: Rust");
    expect(summary).toHaveTextContent("Not carried into this document: Field Inspector, Map location");
    expect(screen.getByLabelText("Operational queue")).toHaveValue("needs_review");
    expect(screen.getByLabelText("Barangay")).toHaveValue("Bacoor");
  });

  it("offers the register's unverified queue instead of a blank control", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    renderBuilderWithScope({
      filters: {
        queue: "unverified_no_active_work",
        predicted_label: "",
        barangay: "",
        case_state: "",
        verification_outcome: "",
        field_validation_state: "",
        authority_classified_condition: "",
      },
      removed: [],
    });

    expect(screen.getByLabelText("Operational queue")).toHaveValue("unverified_no_active_work");
    expect(screen.getByLabelText("Printable report scope")).toHaveTextContent("Queue: Unverified, no active work");
    const iframe = await screen.findByTitle("Live report preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toContain("queue=unverified_no_active_work");
  });

  it("starts from the work scope that is current when the builder opens", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    const user = userEvent.setup();
    const empty = {
      filters: {
        queue: "",
        predicted_label: "",
        barangay: "",
        case_state: "",
        verification_outcome: "",
        field_validation_state: "",
        authority_classified_condition: "",
      },
      removed: [],
    };
    function Harness() {
      const [open, setOpen] = useState(false);
      const [scope, setScope] = useState(empty);
      return (
        <>
          <button type="button" onClick={() => setScope({ ...scope, filters: { ...scope.filters, queue: "needs_review", barangay: "Bacoor" } })}>Filter the queue</button>
          <button type="button" onClick={() => setOpen(true)}>Generate report</button>
          <ReportDocumentBuilder open={open} onClose={() => setOpen(false)} scope={scope} />
        </>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/reports"]}>
          <Routes>
            <Route path="/reports" element={<Harness />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Filter the queue" }));
    await user.click(screen.getByRole("button", { name: "Generate report" }));

    expect(screen.getByLabelText("Operational queue")).toHaveValue("needs_review");
    expect(screen.getByLabelText("Barangay")).toHaveValue("Bacoor");
    expect(screen.getByLabelText("Printable report scope")).toHaveTextContent("Queue: Needs Review");
    const iframe = await screen.findByTitle("Live report preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toContain("queue=needs_review");
    expect(iframe.getAttribute("src")).toContain("barangay=Bacoor");
  });

  it("restores the arriving scope instead of leaving an edited filter in place", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    const user = userEvent.setup();
    renderBuilderWithScope(scope);

    await screen.findByLabelText("Printable report scope");
    const queue = screen.getByLabelText("Operational queue");
    await user.selectOptions(queue, "follow_up_due");
    expect(queue).toHaveValue("follow_up_due");
    // The scope summary follows the filters the document is built from.
    expect(screen.getByLabelText("Printable report scope")).toHaveTextContent("Queue: Follow-up Due");

    await user.click(screen.getByRole("button", { name: "Reset to the current work scope" }));
    expect(queue).toHaveValue("needs_review");
  });

  it("keeps the official weekly version on its own named path, never the filtered preview", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    const user = userEvent.setup();
    renderBuilderWithScope(scope);

    expect(await screen.findByRole("button", { name: "Filtered printable report" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Official weekly report" }));

    const official = screen.getByRole("region", { name: "Official weekly version" });
    expect(within(official).getByText(/not filtered by the work queue/i)).toBeInTheDocument();
    expect(within(official).getByRole("button", { name: "Prepare district version" })).toBeInTheDocument();
    expect(screen.queryByTitle("Live report preview")).not.toBeInTheDocument();
  });
});

describe("ReportDocumentBuilder cross-origin document actions", () => {
  const apiOrigin = new URL(env.apiBaseUrl).origin;

  it("asks the document to print in its own window at the explicit API origin", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    renderBuilderWithScope();

    const iframe = await screen.findByTitle("Live report preview") as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: { postMessage } });

    await userEvent.setup().click(screen.getByRole("button", { name: "Print" }));

    // The parent never calls contentWindow.print() across origins.
    expect(postMessage).toHaveBeenCalledWith({ type: "caneguard-report-print" }, apiOrigin);
  });

  it("ignores download messages from another origin or another window", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    const get = vi.spyOn(axiosClient, "get");
    renderBuilderWithScope();

    const iframe = await screen.findByTitle("Live report preview") as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow;

    dispatchReportDownload("https://attacker.test", frameWindow);
    dispatchReportDownload(apiOrigin, null);
    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();

    dispatchReportDownload(apiOrigin, frameWindow);
    await waitFor(() => expect(get).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/reports/documents/report/pdf?"),
      { responseType: "blob" },
    ));
  });

  it("closes the dialog when the embedded document asks to, and only from its own frame at the API origin", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    const onClose = vi.fn();
    renderBuilder(onClose);

    const iframe = await screen.findByTitle("Live report preview") as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow;

    dispatchReportClose("https://attacker.test", frameWindow);
    dispatchReportClose(apiOrigin, null);
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();

    dispatchReportClose(apiOrigin, frameWindow);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ReportDocumentBuilder keyboard behaviour", () => {
  it("moves focus into the builder and restores it to the launcher on Escape", async () => {
    vi.mocked(checkApiHealth).mockResolvedValue({ reachability: "reachable", checks: { database: "ready", storage: "ready" } });
    const user = userEvent.setup();
    renderLauncher();

    const launcher = screen.getByRole("button", { name: "Generate report" });
    await user.click(launcher);

    const dialog = await screen.findByRole("dialog", { name: "Generate report" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Period")).toHaveFocus();
    // The preview is out of the sequential tab order; Escape inside it is
    // forwarded by the document itself as a close intent.
    expect(await screen.findByTitle("Live report preview")).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(launcher).toHaveFocus();
  });
});

function dispatchReportDownload(origin: string, source: unknown) {
  const event = new MessageEvent("message", {
    data: { type: "caneguard-report-download" },
    origin,
  });
  Object.defineProperty(event, "source", { value: source });
  window.dispatchEvent(event);
}

function dispatchReportClose(origin: string, source: unknown) {
  const event = new MessageEvent("message", {
    data: { type: "caneguard-report-close" },
    origin,
  });
  Object.defineProperty(event, "source", { value: source });
  window.dispatchEvent(event);
}

function renderBuilderWithScope(scope?: Parameters<typeof ReportDocumentBuilder>[0]["scope"]) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/reports"]}>
        <Routes>
          <Route path="/reports" element={<ReportDocumentBuilder open onClose={vi.fn()} scope={scope} />} />
          <Route path="/dashboard" element={<p>Dashboard home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderLauncher() {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Generate report</button>
        <ReportDocumentBuilder open={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/reports"]}>
        <Routes>
          <Route path="/reports" element={<Harness />} />
          <Route path="/dashboard" element={<p>Dashboard home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
