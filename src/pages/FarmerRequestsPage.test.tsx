import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { useAuth } from "../auth/useAuth";
import * as api from "../services/farmerInquiries.api";
import { adminAccount } from "../test/accountFixtures";
import { FarmerRequestsPage } from "./FarmerRequestsPage";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../services/farmerInquiries.api", async original => ({ ...await original<typeof api>(), listFarmerInquiries: vi.fn(), startInquiryReview: vi.fn(), replyToInquiry: vi.fn(), listValidatedAdvisories: vi.fn() }));
const base: api.FarmerInquiry = {
  uuid: "00000000-0000-4000-8000-000000000601", status: "new", lock_version: 1, farmer: { uuid: "00000000-0000-4000-8000-000000000501", name: "Marites Dalisay" },
  barangay: "Lumbangan", landmark: "Tabing sapa", concern: "spreading", note: "May itim na usbong", ai_hint: { label: "smut", confidence_percent: 91, verified: false },
  photos: [{ position: 1, url: "/api/v1/farmer-inquiries/x/photos/1", content_type: "image/jpeg", bytes: 1000 }], replies: [], reviewed_by: null, created_at: "2026-11-26T02:14:00.000Z", replied_at: null,
};
const replied: api.FarmerInquiry = { ...base, uuid: "00000000-0000-4000-8000-000000000602", farmer: { ...base.farmer, name: "Danilo Cruz" }, status: "replied", lock_version: 3, replies: [{ uuid: "00000000-0000-4000-8000-000000000701", kind: "note", body: "Looks fine", advisory_title: null, created_at: null, author_name: "Reviewer" }] };
const advisory = { uuid: "00000000-0000-4000-8000-000000000801", code: "ADV-SMUT-01", title: "Smut care", content: "Cut and bag shoots.", status: "validated" };
function renderPage() {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FarmerRequestsPage /></MemoryRouter></QueryClientProvider>);
}
describe("Farmer requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: adminAccount, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.listFarmerInquiries).mockResolvedValue({ data: [base, replied], meta: { page: 1, per_page: 25, total: 2, waiting: 1 } });
    vi.mocked(api.listValidatedAdvisories).mockResolvedValue([advisory]);
  });
  it("lists requests with an unverified AI hint and says they are outside cases and reports", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Farmer requests" });
    expect(within(table).getByRole("columnheader", { name: "AI hint (unverified)" })).toBeInTheDocument();
    expect(within(table).getAllByText("Smut", { selector: "td" })).toHaveLength(2);
    expect(screen.getByText(/1 waiting for a reply\. Not part of cases, maps or reports\./)).toBeInTheDocument();
  });
  it("filters by status and barangay and returns to page one", async () => {
    renderPage();
    await screen.findByText("Marites Dalisay");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Status"), "new");
    await user.selectOptions(screen.getByLabelText("Barangay"), "Aga");
    await waitFor(() => expect(api.listFarmerInquiries).toHaveBeenLastCalledWith({ page: 1, status: "new", barangay: "Aga" }, expect.anything()));
  });
  it("replies with a validated advisory and a note using the loaded version", async () => {
    vi.mocked(api.replyToInquiry).mockResolvedValue({ ...base, status: "replied", lock_version: 2 });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open request from Marites Dalisay" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("img", { name: "Farmer photo 1" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send reply" })).toBeDisabled();
    await user.selectOptions(await within(dialog).findByLabelText("Validated advisory"), advisory.uuid);
    await user.type(within(dialog).getByLabelText("Note to the farmer"), "Check nearby plants");
    await user.click(within(dialog).getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(api.replyToInquiry).toHaveBeenCalledWith(base.uuid, { expected_lock_version: 1, advisory_uuid: advisory.uuid, body: "Check nearby plants" }));
    expect(await screen.findByText("Reply sent.")).toBeInTheDocument();
  });
  it("marks a new request as reviewing", async () => {
    vi.mocked(api.startInquiryReview).mockResolvedValue({ ...base, status: "reviewing", lock_version: 2 });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open request from Marites Dalisay" }));
    await user.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Start reviewing" }));
    await waitFor(() => expect(api.startInquiryReview).toHaveBeenCalledWith(base.uuid, 1));
  });
  it("tells the reviewer when someone else changed the request", async () => {
    vi.mocked(api.replyToInquiry).mockRejectedValue(new ApiError("This request changed.", { status: 409 }));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open request from Marites Dalisay" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Note to the farmer"), "Hello");
    await user.click(within(dialog).getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("This request changed. Reopen it to see the latest.")).toBeInTheDocument();
  });
  it("shows a replied request read-only with the reply", async () => {
    renderPage();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Open request from Danilo Cruz" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Looks fine/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Send reply" })).not.toBeInTheDocument();
  });
});
