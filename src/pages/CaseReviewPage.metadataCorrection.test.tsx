import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
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

function withProvince(province: string, version: number) {
  return {
    ...reportDetailDto,
    observations: { ...reportDetailDto.observations, province },
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
      current = withProvince("Batangas", 2);
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
    current = withProvince("Laguna", 1);
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
});
