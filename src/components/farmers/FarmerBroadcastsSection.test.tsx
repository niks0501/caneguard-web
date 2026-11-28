import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../auth/useAuth";
import * as api from "../../services/farmerBroadcasts.api";
import { adminAccount } from "../../test/accountFixtures";
import { FarmerBroadcastsSection } from "./FarmerBroadcastsSection";

vi.mock("../../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../../services/farmerBroadcasts.api", async (original) => ({
  ...await original<typeof api>(),
  listFarmerBroadcasts: vi.fn(),
  publishFarmerBroadcast: vi.fn(),
  retireFarmerBroadcast: vi.fn(),
  listValidatedAdvisories: vi.fn(),
}));

const advisory = {
  uuid: "00000000-0000-4000-8000-000000000801",
  code: "ADV-SMUT-01",
  title: "Smut care",
  content: "Cut and bag shoots.",
  status: "validated",
};

const live: api.FarmerBroadcast = {
  uuid: "00000000-0000-4000-8000-000000000901",
  advisory: { uuid: advisory.uuid, code: advisory.code, title: advisory.title },
  headline_tl: "Paalala sa Smut",
  headline_en: "Smut reminder",
  body_tl: "Putulin at ibalot ang may itim na usbong.",
  body_en: "Cut and bag shoots with black whips.",
  barangays: ["Aga", "Banilad"],
  published_at: "2026-11-26T02:00:00.000Z",
  expires_at: "2026-12-10T02:00:00.000Z",
  retired_at: null,
  live: true,
  reach: 19,
};

const withdrawn: api.FarmerBroadcast = {
  ...live,
  uuid: "00000000-0000-4000-8000-000000000902",
  headline_tl: "Binawing paalala",
  headline_en: "Withdrawn alert",
  barangays: null,
  retired_at: "2026-11-27T04:00:00.000Z",
  live: false,
  reach: 42,
};

const reachMeta: api.BroadcastReachMeta = {
  total_verified_farmers: 42,
  barangay_counts: {
    Aga: 12,
    Banilad: 7,
    Tumalim: 0,
  },
};

function renderSection() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FarmerBroadcastsSection />
    </QueryClientProvider>,
  );
}

describe("Barangay broadcasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: adminAccount,
      status: "authenticated",
      reason: null,
      restoreSession: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(api.listFarmerBroadcasts).mockResolvedValue({ items: [live], meta: reachMeta });
    vi.mocked(api.listValidatedAdvisories).mockResolvedValue([advisory]);
  });

  it("lists broadcasts with their barangays and how many farmers they reach", async () => {
    renderSection();
    const table = await screen.findByRole("table", { name: "Barangay broadcasts" });
    expect(within(table).getByText("Aga, Banilad")).toBeInTheDocument();
    expect(within(table).getByText("19")).toBeInTheDocument();
    expect(within(table).getByText("Live")).toBeInTheDocument();
  });

  it("requires confirmation before withdrawing a live broadcast", async () => {
    vi.mocked(api.retireFarmerBroadcast).mockResolvedValue({
      ...live,
      live: false,
      retired_at: "2026-11-26T03:00:00.000Z",
    });
    renderSection();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Withdraw Smut reminder" }));

    expect(api.retireFarmerBroadcast).not.toHaveBeenCalled();
    const confirmDialog = await screen.findByRole("dialog", { name: "Withdraw broadcast" });
    expect(within(confirmDialog).getByText("Smut reminder")).toBeInTheDocument();
    expect(within(confirmDialog).getByText(/19 verified farmers/)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole("button", { name: "Keep live" }));
    expect(api.retireFarmerBroadcast).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Withdraw Smut reminder" }));
    const reopenedDialog = await screen.findByRole("dialog", { name: "Withdraw broadcast" });
    await user.click(within(reopenedDialog).getByRole("button", { name: "Confirm withdraw" }));

    await waitFor(() => expect(api.retireFarmerBroadcast).toHaveBeenCalledWith(live.uuid));
    expect(await screen.findByText("Broadcast withdrawn.")).toBeInTheDocument();
  });

  it("filters broadcasts by status and search and opens the full bilingual message modal", async () => {
    vi.mocked(api.listFarmerBroadcasts).mockResolvedValue({ items: [live, withdrawn], meta: reachMeta });
    renderSection();
    const user = userEvent.setup();

    await screen.findByRole("table", { name: "Barangay broadcasts" });
    expect(screen.getByText("Smut reminder")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn alert")).toBeInTheDocument();

    const statusFilters = screen.getByRole("group", { name: "Filter broadcasts by status" });
    await user.click(within(statusFilters).getByRole("button", { name: /Withdrawn/i }));
    expect(screen.queryByText("Smut reminder")).not.toBeInTheDocument();
    expect(screen.getByText("Withdrawn alert")).toBeInTheDocument();

    await user.click(within(statusFilters).getByRole("button", { name: /^All/i }));
    await user.type(screen.getByRole("searchbox", { name: "Search broadcasts" }), "Banilad");
    expect(screen.getByText("Smut reminder")).toBeInTheDocument();
    expect(screen.queryByText("Withdrawn alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View Smut reminder" }));
    const viewer = await screen.findByRole("dialog", { name: "Broadcast message" });
    expect(within(viewer).getByText("Putulin at ibalot ang may itim na usbong.")).toBeInTheDocument();
    expect(within(viewer).getByText("Cut and bag shoots with black whips.")).toBeInTheDocument();
    await user.click(within(viewer).getByRole("button", { name: "Done" }));
  });

  it("shows an error alert with retry when the validated advisory library fails to load", async () => {
    vi.mocked(api.listValidatedAdvisories)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce([advisory]);
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Publish broadcast" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish broadcast" });

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Validated advisories could not be loaded.");
    const retryButton = within(alert).getByRole("button", { name: "Retry advisories" });

    await user.click(retryButton);
    await waitFor(() =>
      expect(within(dialog).getByRole("option", { name: /ADV-SMUT-01/ })).toBeInTheDocument(),
    );
    expect(within(dialog).queryByText("Validated advisories could not be loaded.")).not.toBeInTheDocument();
  });

  it("publishes to selected barangays with live reach estimate, searchable picker, phone preview, and missing-field hints", async () => {
    vi.mocked(api.publishFarmerBroadcast).mockResolvedValue(live);
    renderSection();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Publish broadcast" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish broadcast" });
    const publish = within(dialog).getByRole("button", { name: "Publish" });

    expect(publish).toBeDisabled();
    expect(within(dialog).getByText(/Required before publishing:/)).toHaveTextContent("validated advisory");
    expect(within(dialog).getByText(/Estimated reach: 42 verified farmers across all barangays/)).toBeInTheDocument();

    await user.selectOptions(await within(dialog).findByLabelText("Validated advisory"), advisory.uuid);
    expect(within(dialog).getByLabelText("Headline (English)")).toHaveValue("Smut care");
    expect(publish).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Headline (Tagalog)"), "Paalala sa Smut");
    await user.type(within(dialog).getByLabelText("Message (Tagalog)"), "Putulin ang usbong");

    // Live phone preview shows Tagalog by default and switches to English on demand.
    const preview = within(dialog).getByRole("region", { name: "Farmer phone preview" });
    expect(within(preview).getByText("Paalala sa Smut")).toBeInTheDocument();
    expect(within(preview).getByText("Putulin ang usbong")).toBeInTheDocument();
    await user.click(within(preview).getByRole("button", { name: "English" }));
    expect(within(preview).getByText("Smut care")).toBeInTheDocument();
    expect(within(preview).getByText("Cut and bag shoots.")).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText("Selected barangays"));
    expect(publish).toBeDisabled();
    expect(within(dialog).getByText(/Select at least one barangay to estimate farmer reach/)).toBeInTheDocument();

    await user.type(within(dialog).getByRole("searchbox", { name: "Search barangays" }), "Aga");
    expect(within(dialog).queryByLabelText("Banilad")).not.toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("Aga"));
    expect(within(dialog).getByText(/Estimated reach: 12 verified farmers across 1 selected barangay/)).toBeInTheDocument();
    expect(within(dialog).getByText("1 of 42 selected")).toBeInTheDocument();

    await user.click(publish);
    await waitFor(() =>
      expect(api.publishFarmerBroadcast).toHaveBeenCalledWith({
        advisory_uuid: advisory.uuid,
        headline_tl: "Paalala sa Smut",
        headline_en: "Smut care",
        body_tl: "Putulin ang usbong",
        body_en: "Cut and bag shoots.",
        all_barangays: false,
        barangays: ["Aga"],
        expires_in_days: 14,
      }),
    );
    expect(await screen.findByText("Broadcast published.")).toBeInTheDocument();
  });
});
