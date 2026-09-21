import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function Harness({
  onClose = () => {},
  isDirty = false,
  disabled = false,
}: {
  onClose?: () => void;
  isDirty?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Modal
        id="test-modal"
        title="Record office decision"
        description="Test description"
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        disabled={disabled}
        isDirty={isDirty}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button">Save decision</button>
          </>
        }
      >
        <label>
          First field
          <input type="text" />
        </label>
        <label>
          Second field
          <input type="text" />
        </label>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("renders nothing while closed and names the dialog when open", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const dialog = screen.getByRole("dialog", { name: "Record office decision" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("places focus inside the dialog on open, closes on Escape, and returns focus to the opener", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Record office decision" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on backdrop click and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it("loops Tab from the last control to the first and Shift+Tab back", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const dialog = screen.getByRole("dialog", { name: "Record office decision" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByLabelText("First field")).toHaveFocus();

    // Forward through the remaining controls in DOM order.
    await user.tab();
    expect(screen.getByLabelText("Second field")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    const last = screen.getByRole("button", { name: "Save decision" });
    expect(last).toHaveFocus();

    // One more Tab loops back to the first control (the close button).
    await user.tab();
    const first = screen.getByRole("button", { name: "Close" });
    expect(first).toHaveFocus();

    // Shift+Tab from the first control loops to the last.
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(last).toHaveFocus();
  });

  it("asks for confirmation before discarding a dirty draft", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<Harness onClose={onClose} isDirty />);

      await user.click(screen.getByRole("button", { name: "Open dialog" }));
      await user.keyboard("{Escape}");

      expect(confirm).toHaveBeenCalledOnce();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      confirm.mockReturnValue(true);
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledOnce();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      confirm.mockRestore();
    }
  });

  it("blocks close controls while disabled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} disabled />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
