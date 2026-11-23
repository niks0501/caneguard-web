import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewHandoffPanel } from "./ReviewHandoffPanel";

describe("ReviewHandoffPanel", () => {
  it("releases with the typed note", async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReviewHandoffPanel onRelease={onRelease} />);

    await user.click(screen.getByRole("button", { name: "Step away" }));
    await user.type(screen.getByLabelText("Note for the next reviewer"), "Back later");
    await user.click(screen.getByRole("button", { name: "Release case" }));

    expect(onRelease).toHaveBeenCalledWith("Back later");
  });

  it("allows leaving without a note and cancelling", async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReviewHandoffPanel onRelease={onRelease} />);

    await user.click(screen.getByRole("button", { name: "Step away" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Step away" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Step away" }));
    await user.click(screen.getByRole("button", { name: "Release case" }));
    expect(onRelease).toHaveBeenCalledWith("");
  });

  it("stays open and says so when the release fails", async () => {
    const user = userEvent.setup();
    render(<ReviewHandoffPanel onRelease={vi.fn().mockRejectedValue(new Error("offline"))} />);

    await user.click(screen.getByRole("button", { name: "Step away" }));
    await user.click(screen.getByRole("button", { name: "Release case" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be released");
    expect(screen.getByRole("button", { name: "Release case" })).toBeEnabled();
  });
});
