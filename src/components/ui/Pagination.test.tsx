import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("keeps large Laravel page counts bounded and navigable", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Pagination
        currentPage={50}
        pageCount={100}
        itemCount={1_500}
        onPageChange={onPageChange}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Report table pagination" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Go to page/ }),
    ).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Go to page 50" }),
    ).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(51);
  });
});
