import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../auth/useAuth";
import * as api from "../../services/farmerInquiries.api";
import { adminAccount } from "../../test/accountFixtures";
import { FarmerBroadcastsSection } from "./FarmerBroadcastsSection";

vi.mock("../../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../../services/farmerInquiries.api", async original => ({ ...await original<typeof api>(), listFarmerBroadcasts: vi.fn(), publishFarmerBroadcast: vi.fn(), retireFarmerBroadcast: vi.fn(), listValidatedAdvisories: vi.fn() }));
const advisory = { uuid: "00000000-0000-4000-8000-000000000801", code: "ADV-SMUT-01", title: "Smut care", content: "Cut and bag shoots.", status: "validated" };
const live: api.FarmerBroadcast = {
  uuid: "00000000-0000-4000-8000-000000000901", advisory: { uuid: advisory.uuid, code: advisory.code, title: advisory.title }, headline_tl: "Paalala sa Smut", headline_en: "Smut reminder",
  body_tl: "Putulin", body_en: "Cut", barangays: ["Aga", "Banilad"], published_at: "2026-11-26T02:00:00.000Z", expires_at: "2026-12-10T02:00:00.000Z", retired_at: null, live: true, reach: 19,
};
function renderSection() {
  return render(<QueryClientProvider client={new QueryClient()}><FarmerBroadcastsSection /></QueryClientProvider>);
}
describe("Barangay broadcasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: adminAccount, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.listFarmerBroadcasts).mockResolvedValue([live]);
    vi.mocked(api.listValidatedAdvisories).mockResolvedValue([advisory]);
  });
  it("lists broadcasts with their barangays and how many farmers they reach", async () => {
    renderSection();
    const table = await screen.findByRole("table", { name: "Barangay broadcasts" });
    expect(within(table).getByText("Aga, Banilad")).toBeInTheDocument();
    expect(within(table).getByText("19")).toBeInTheDocument();
    expect(within(table).getByText("Live")).toBeInTheDocument();
  });
  it("withdraws a live broadcast", async () => {
    vi.mocked(api.retireFarmerBroadcast).mockResolvedValue({ ...live, live: false, retired_at: "2026-11-26T03:00:00.000Z" });
    renderSection();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Withdraw Smut reminder" }));
    await waitFor(() => expect(api.retireFarmerBroadcast).toHaveBeenCalledWith(live.uuid));
    expect(await screen.findByText("Broadcast withdrawn.")).toBeInTheDocument();
  });
  it("publishes to selected barangays only after the office writes both languages", async () => {
    vi.mocked(api.publishFarmerBroadcast).mockResolvedValue(live);
    renderSection();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Publish broadcast" }));
    const dialog = await screen.findByRole("dialog");
    const publish = within(dialog).getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();
    await user.selectOptions(await within(dialog).findByLabelText("Validated advisory"), advisory.uuid);
    expect(within(dialog).getByLabelText("Headline (English)")).toHaveValue("Smut care");
    expect(publish).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Headline (Tagalog)"), "Paalala sa Smut");
    await user.type(within(dialog).getByLabelText("Message (Tagalog)"), "Putulin ang usbong");
    await user.click(within(dialog).getByLabelText("Selected barangays"));
    expect(publish).toBeDisabled();
    await user.click(within(dialog).getByLabelText("Aga"));
    await user.click(publish);
    await waitFor(() => expect(api.publishFarmerBroadcast).toHaveBeenCalledWith({
      advisory_uuid: advisory.uuid, headline_tl: "Paalala sa Smut", headline_en: "Smut care", body_tl: "Putulin ang usbong", body_en: "Cut and bag shoots.",
      all_barangays: false, barangays: ["Aga"], expires_in_days: 14,
    }));
    expect(await screen.findByText("Broadcast published.")).toBeInTheDocument();
  });
});
