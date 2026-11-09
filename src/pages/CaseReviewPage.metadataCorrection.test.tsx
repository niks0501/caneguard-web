import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env";
import { reportDetailDto } from "../test/fixtures";
import { server } from "../test/server";
import { CaseReviewPage } from "./CaseReviewPage";

const apiBase = env.apiBaseUrl;
const uuid = reportDetailDto.identity.uuid;
type Payload = Record<string, unknown>;
let payloads: Payload[] = [];
let current: Record<string, unknown>;
let queryClient: QueryClient;

function withFields(version: number, fields: Record<string, unknown>) {
  return {
    ...reportDetailDto,
    ...fields,
    observations: { ...reportDetailDto.observations, ...fields },
    version,
  } as unknown as Record<string, unknown>;
}

function installApi() {
  current = reportDetailDto as unknown as Record<string, unknown>;
  server.use(
    http.get(`${apiBase}/api/v1/reports/${uuid}`, () => HttpResponse.json({ data: current })),
    http.get(`${apiBase}/api/v1/reports/${uuid}/possible-matches`, () =>
      HttpResponse.json({ data: [], meta: { possible_match: false, can_submit: true } }),
    ),
    http.get(`${apiBase}/api/v1/field-reporters`, () => HttpResponse.json({ data: [] })),
    http.get(`${apiBase}/api/v1/advisories`, () => HttpResponse.json({ data: [] })),
    http.post(`${apiBase}/api/v1/reports/${uuid}/open`, () =>
      HttpResponse.json({ data: { uuid, first_reviewed_at: "2026-07-21T02:00:00.000Z" } }),
    ),
    http.patch(`${apiBase}/api/v1/reports/${uuid}/review`, async ({ request }) => {
      payloads.push((await request.json()) as Payload);
      current = withFields(2, { province: "Batangas" });
      return HttpResponse.json({ data: current });
    }),
  );
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/reports/${uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: reportDetailDto.identity.reference_code });
  await user.click(screen.getByRole("button", { name: "Correct case information" }));
}

describe("Metadata correction lost-update guard", () => {
  beforeEach(() => {
    payloads = [];
    installApi();
  });

  it("sends only the edited field against the version pinned on open, and clears the draft after success", async () => {
    const user = userEvent.setup();
    await openModal(user);
    const barangay = await screen.findByLabelText("Barangay");
    await user.clear(barangay);
    await user.type(barangay, "Wawa");

    // Another reviewer saves a newer province while the pop-up is open.
    current = withFields(1, { province: "Laguna" });
    await queryClient.invalidateQueries({ queryKey: ["reports"] });

    expect(await screen.findByText(/This report changed after you opened this pop-up/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save correction" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Review latest values" }));
    expect(screen.getByLabelText("Province")).toHaveValue("Laguna");
    await user.type(screen.getByRole("textbox", { name: /Correction reason/ }), "Verified on site");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0].expected_version).toBe(1);
    const sent = payloads[0].metadata_corrections as Payload;
    expect(sent.barangay).toBe("Wawa");
    expect(sent.province).toBeUndefined();

    await waitFor(() => expect(screen.queryByRole("textbox", { name: /Correction reason/ })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Correct case information" }));
    expect(screen.getByRole("textbox", { name: /Correction reason/ })).toHaveValue("");
    expect(screen.getByLabelText("Barangay")).toHaveValue(reportDetailDto.barangay ?? "Balaytigui");
  });

  it("drops a field the reviewer restored to the value it showed before the report changed", async () => {
    const user = userEvent.setup();
    await openModal(user);
    const province = await screen.findByLabelText("Province");
    await user.clear(province);
    await user.type(province, "Laguna");
    await user.clear(province);
    await user.type(province, "Batangas");
    const barangay = screen.getByLabelText("Barangay");
    await user.clear(barangay);
    await user.type(barangay, "Wawa");

    // Another reviewer saves the province this reviewer just restored.
    current = withFields(1, { province: "Laguna" });
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    expect(await screen.findByText(/This report changed after you opened this pop-up/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review latest values" }));
    expect(screen.getByLabelText("Province")).toHaveValue("Laguna");
    await user.type(screen.getByRole("textbox", { name: /Correction reason/ }), "Barangay confirmed on site");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    const sent = payloads[0].metadata_corrections as Payload;
    expect(sent.barangay).toBe("Wawa");
    expect(sent.province).toBeUndefined();
  });

  it("discards the draft on a confirmed cancel so reopening cannot overwrite a newer value", async () => {
    const user = userEvent.setup();
    const discard = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      await openModal(user);
      const barangay = await screen.findByLabelText("Barangay");
      await user.clear(barangay);
      await user.type(barangay, "Wawa");

      // Another reviewer corrects the same field while the pop-up is open.
      current = withFields(1, { barangay: "Malaya" });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      expect(await screen.findByText(/This report changed after you opened this pop-up/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await user.click(screen.getByRole("button", { name: "Correct case information" }));

      expect(screen.getByLabelText("Barangay")).toHaveValue("Malaya");
      expect(screen.getByRole("textbox", { name: /Correction reason/ })).toHaveValue("");
      await user.type(screen.getByRole("textbox", { name: /Correction reason/ }), "Barangay confirmed on site");
      await user.click(screen.getByRole("button", { name: "Save correction" }));
      await waitFor(() =>
        expect(screen.queryByRole("textbox", { name: /Correction reason/ })).not.toBeInTheDocument(),
      );
      expect(payloads).toHaveLength(0);
    } finally {
      discard.mockRestore();
    }
  });
});
