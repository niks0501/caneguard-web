import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { GuideGallery } from "./GuideGallery";

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: "*", element: <GuideGallery /> }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

describe("GuideGallery on /guide", () => {
  it("renders five direct links and no drawer", () => {
    renderAt("/guide");
    expect(screen.getAllByRole("link", { name: /Sugarcane|Healthy|Red-Striped/ })).toHaveLength(5);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("filters to one pest link", async () => {
    renderAt("/guide");
    await userEvent.click(screen.getByRole("button", { name: "Pest" }));
    expect(screen.getAllByRole("link", { name: /Red-Striped/ })).toHaveLength(1);
  });
});

describe("GuideGallery on /", () => {
  it("opens the rust quick-inspect drawer by default", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 3, name: "Sugarcane rust" })).toBeInTheDocument();
    expect(screen.getByText("/guide/rust")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Symptoms",
      "Prevention",
      "Management",
      "Why it matters",
    ]);
    expect(screen.getByRole("link", { name: "Open the full guide" })).toHaveAttribute("href", "/guide/rust");
    expect(screen.getByText(/decision support, not a diagnosis/)).toBeInTheDocument();
  });

  it("selects a specimen, switches tabs and follows the filter", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getAllByRole("button", { name: /Healthy/ }).at(-1)!);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Prevention" }));
    expect(screen.getByRole("tab", { name: "Prevention" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Pest" }));
    expect(screen.getByText("/guide/rssi")).toBeInTheDocument();
  });
});
