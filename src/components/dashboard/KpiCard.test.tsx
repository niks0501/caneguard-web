import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

function renderCard(
  overrides: Partial<Parameters<typeof KpiCard>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <KpiCard
        label="Submitted reports"
        value="12"
        support="+3 vs previous period"
        icon={<span data-testid="card-icon" />}
        href="/reports"
        linkLabel="Open the submitted reports register"
        {...overrides}
      >
        <span data-testid="card-graphic" />
      </KpiCard>
    </MemoryRouter>,
  );
}

describe("KpiCard composition", () => {
  it("stacks header row, value, supporting line and graphic with no other copy", () => {
    const { container } = renderCard();

    const slots = Array.from(
      container.querySelectorAll(
        ".kpi-card__top, .kpi-card__value, .kpi-card__support, .kpi-card__graphic",
      ),
    ).map((element) => element.className);
    expect(slots).toEqual([
      "kpi-card__top",
      "kpi-card__value",
      "kpi-card__support",
      "kpi-card__graphic",
    ]);
    // Nothing else is printed on the card: no Open row, no legend, no prose.
    const card = screen.getByRole("article", { name: "Submitted reports" });
    expect(card.textContent).toBe("Submitted reports12+3 vs previous period");
  });

  it("links the whole card to its queue with the established accessible name", () => {
    renderCard();

    expect(
      screen.getByRole("link", { name: "Open the submitted reports register" }),
    ).toHaveAttribute("href", "/reports");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("marks an unavailable figure instead of printing a zero", () => {
    renderCard({ value: "—", support: "Previous period unavailable", unavailable: true });

    expect(screen.getByText("—")).toBeInTheDocument();
    const srOnly = screen.getByText("Unavailable");
    expect(srOnly).toHaveClass("sr-only");
    expect(
      screen.getByText("Previous period unavailable"),
    ).toBeInTheDocument();
  });

  it("renders no value-parity text for an available figure", () => {
    renderCard();

    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });
});
