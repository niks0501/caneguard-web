import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../services/accountsAdmin.api";
import { AddAccountDialog } from "./AddAccountDialog";

vi.mock("../../services/accountsAdmin.api", async original => ({ ...await original<typeof api>(), createAccount: vi.fn() }));

describe("Add account success copy", () => {
  beforeEach(() => vi.clearAllMocks());
  it("tells the office a field inspector sets a password first, then signs in on the phone, with the pilot district automatic", async () => {
    vi.mocked(api.createAccount).mockResolvedValue({ data: { uuid: "00000000-0000-4000-8000-000000000401", name: "New Inspector", email: "new@example.test", role: "field_reporter" }, invite_sent: true });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<AddAccountDialog onCreated={onCreated} />);
    await user.click(screen.getByRole("button", { name: "Add account" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Full name"), "New Inspector");
    await user.type(within(dialog).getByLabelText("Work email"), "new@example.test");
    await user.selectOptions(within(dialog).getByLabelText("Role"), "field_reporter");
    await user.type(within(dialog).getByLabelText("Your current password"), "synthetic-password");
    await user.click(within(dialog).getByRole("button", { name: "Create account" }));
    const notice = String(onCreated.mock.calls[0][0]);
    expect(notice).toContain("1. They open the set-password email. 2. They sign in on the phone. They are added to the pilot district automatically.");
    expect(notice).not.toContain("Tell them to sign in through the mobile app");
  });
});
