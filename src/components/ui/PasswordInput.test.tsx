import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./FormControls";

describe("PasswordInput", () => {
  it("hides the value until the toggle is pressed, per field", async () => {
    const user = userEvent.setup();
    render(
      <>
        <label>
          First
          <PasswordInput defaultValue="one" />
        </label>
        <label>
          Second
          <PasswordInput defaultValue="two" />
        </label>
      </>,
    );
    const first = screen.getByLabelText("First");
    const second = screen.getByLabelText("Second");
    expect(first).toHaveAttribute("type", "password");

    await user.click(screen.getAllByRole("button", { name: "Show password" })[0]);

    expect(first).toHaveAttribute("type", "text");
    expect(second).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });
});
