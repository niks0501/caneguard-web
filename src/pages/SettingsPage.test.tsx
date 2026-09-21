import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/useAuth";
import * as accountApi from "../services/account.api";
import { SettingsPage } from "./SettingsPage";

vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../services/account.api", () => ({
  changePassword: vi.fn(),
  changeEmail: vi.fn(),
  listMobileDevices: vi.fn(),
  revokeMobileDevice: vi.fn(),
}));

function renderSettingsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        uuid: "00000000-0000-4000-8000-000000000100",
        name: "Maria Santos",
        email: "maria.santos@sra.gov.ph",
        role: "reviewer",
      },
      status: "authenticated",
      reason: null,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    vi.mocked(accountApi.listMobileDevices).mockResolvedValue([
      {
        id: 1,
        deviceId: "samsung-sm-g991b-01",
        deviceName: "Samsung Galaxy S21",
        createdAt: "2026-06-15T09:30:00.000Z",
        lastUsedAt: "2026-07-21T14:15:00.000Z",
        expiresAt: null,
        isCurrent: false,
      },
    ]);
  });

  it("sets document title and renders account profile", async () => {
    renderSettingsPage();

    expect(document.title).toBe("Account settings | CaneGuard");
    expect(screen.getByRole("heading", { name: "Account settings" })).toBeInTheDocument();
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByText("maria.santos@sra.gov.ph")).toBeInTheDocument();
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.getByText("00000000-0000-4000-8000-000000000100")).toBeInTheDocument();
  });

  it("renders enrolled mobile devices and allows revoking a device", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.revokeMobileDevice).mockResolvedValue({
      message: "Device revoked successfully.",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText("Samsung Galaxy S21")).toBeInTheDocument();
    });
    expect(screen.getByText("samsung-sm-g991b-01")).toBeInTheDocument();

    const revokeBtn = screen.getByRole("button", { name: /Revoke/i });
    await user.click(revokeBtn);

    expect(accountApi.revokeMobileDevice).toHaveBeenCalledWith(1, expect.anything());
    await waitFor(() => {
      expect(screen.getByText("Device revoked successfully.")).toBeInTheDocument();
    });
  });

  it("validates and submits password change", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.changePassword).mockResolvedValue({
      message: "Password updated successfully.",
    });

    renderSettingsPage();

    const currentPwdInput = screen.getByLabelText("Current password");
    const newPwdInput = screen.getByLabelText("New password");
    const confirmPwdInput = screen.getByLabelText("Confirm new password");
    const submitBtn = screen.getByRole("button", { name: "Update password" });

    // Submit with mismatch
    await user.type(currentPwdInput, "An old reviewer passphrase");
    await user.type(newPwdInput, "A replacement reviewer passphrase");
    await user.type(confirmPwdInput, "A non matching passphrase");
    await user.click(submitBtn);

    expect(
      screen.getByText("The new password and confirmation do not match."),
    ).toBeInTheDocument();
    expect(accountApi.changePassword).not.toHaveBeenCalled();

    // Fix confirmation and submit
    await user.clear(confirmPwdInput);
    await user.type(confirmPwdInput, "A replacement reviewer passphrase");
    await user.click(submitBtn);

    expect(accountApi.changePassword).toHaveBeenCalledWith({
      currentPassword: "An old reviewer passphrase",
      password: "A replacement reviewer passphrase",
      passwordConfirmation: "A replacement reviewer passphrase",
    });

    await waitFor(() => {
      expect(screen.getByText("Password updated successfully.")).toBeInTheDocument();
    });
  });

  it("disables credential submits while a request is in flight", async () => {
    const user = userEvent.setup();
    let resolvePassword!: (value: { message: string }) => void;
    vi.mocked(accountApi.changePassword).mockReturnValue(
      new Promise((resolve) => {
        resolvePassword = resolve;
      }),
    );

    renderSettingsPage();

    await user.type(screen.getByLabelText("Current password"), "An old reviewer passphrase");
    await user.type(screen.getByLabelText("New password"), "A replacement reviewer passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "A replacement reviewer passphrase");
    const submitBtn = screen.getByRole("button", { name: "Update password" });

    await user.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Updating password..." })).toBeDisabled();
    });
    await user.click(screen.getByRole("button", { name: "Updating password..." }));

    expect(accountApi.changePassword).toHaveBeenCalledTimes(1);

    resolvePassword({ message: "Password updated successfully." });
    await waitFor(() => {
      expect(screen.getByText("Password updated successfully.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled();
  });

  it("validates and submits email change", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.changeEmail).mockResolvedValue({
      message: "Email updated. Verify the new address before signing in again.",
    });

    renderSettingsPage();

    const emailPwdInput = screen.getByLabelText("Current password (for verification)");
    const newEmailInput = screen.getByLabelText("New email address");
    const submitBtn = screen.getByRole("button", { name: "Update email" });

    await user.type(emailPwdInput, "The current reviewer passphrase");
    await user.type(newEmailInput, "maria.new@sra.gov.ph");
    await user.click(submitBtn);

    expect(accountApi.changeEmail).toHaveBeenCalledWith({
      currentPassword: "The current reviewer passphrase",
      email: "maria.new@sra.gov.ph",
    });

    await waitFor(() => {
      expect(
        screen.getByText("Email updated. Verify the new address before signing in again."),
      ).toBeInTheDocument();
    });
  });
});
