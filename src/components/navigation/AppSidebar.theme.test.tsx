import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./AppSidebar";
import { applyTheme, setTheme } from "../../theme/themePreference";

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { name: "Maria Santos", role: "reviewer" }, logout: vi.fn() }),
}));

function brandMarkSource(container: HTMLElement) {
  const mark = container.querySelector(".brand__mark img");
  if (!mark) throw new Error("The sidebar renders its brand mark");
  return mark.getAttribute("src");
}

afterEach(() => {
  act(() => setTheme("paper"));
  applyTheme("paper");
});

describe("sidebar brand mark", () => {
  it("paints the on-dark artwork once the ground turns dark", () => {
    act(() => setTheme("paper"));
    const { container } = render(
      <MemoryRouter>
        <AppSidebar />
      </MemoryRouter>,
    );
    const onPaper = brandMarkSource(container);

    act(() => setTheme("dark"));

    expect(brandMarkSource(container)).not.toBe(onPaper);
  });
});
