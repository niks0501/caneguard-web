import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type {
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../../domain/fieldValidation.types";
import { FieldValidationQueuePanel } from "./FieldValidationQueuePanel";

function createItem(id: number, overrides: Partial<FieldValidationQueueItem> = {}): FieldValidationQueueItem {
  return {
    uuid: `uuid-${id}`,
    referenceCode: `CG-2026-${String(id).padStart(4, "0")}`,
    barangay: "Mabini",
    province: "Negros Occidental",
    municipality: "Bago",
    observedAt: "2026-07-18T08:00:00+08:00",
    submittedAt: "2026-07-18T09:00:00+08:00",
    predictedDisease: "rust",
    confidence: 0.85,
    reviewStatus: "for_field_validation",
    targetVisitDate: "2026-07-25",
    assignee: null,
    finalLatitude: 10.5,
    finalLongitude: 122.9,
    locationSource: "gps",
    gpsAccuracy: 5,
    affectedAreaHectares: 2,
    affectedPortionPercent: 20,
    ...overrides,
  };
}

function renderPanel(data: FieldValidationQueueData) {
  return render(
    <MemoryRouter>
      <FieldValidationQueuePanel data={data} />
    </MemoryRouter>,
  );
}

describe("FieldValidationQueuePanel", () => {
  it("renders Assigned to column/field for queue items", () => {
    const item1 = createItem(1, {
      assignee: { uuid: "user-1", name: "Maria Santos" },
    });
    const item2 = createItem(2, { assignee: null });
    const data: FieldValidationQueueData = {
      queue: "needs_visit",
      count: 2,
      oldest: item1,
      items: [item1, item2],
    };

    renderPanel(data);

    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
  });

  it("filters items by All, Mine, and Unassigned", async () => {
    const user = userEvent.setup();
    const item1 = createItem(1, {
      assignee: { uuid: "user-1", name: "Maria Santos" },
    });
    const item2 = createItem(2, { assignee: null });
    const data: FieldValidationQueueData = {
      queue: "needs_visit",
      count: 2,
      oldest: item1,
      items: [item1, item2],
    };

    renderPanel(data);

    expect(screen.getByText("CG-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("CG-2026-0002")).toBeInTheDocument();

    // Filter to Unassigned
    await user.click(screen.getByRole("button", { name: "Unassigned" }));
    expect(screen.queryByText("CG-2026-0001")).not.toBeInTheDocument();
    expect(screen.getByText("CG-2026-0002")).toBeInTheDocument();

    // Filter to Mine (matches Maria Santos)
    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(screen.getByText("CG-2026-0001")).toBeInTheDocument();
    expect(screen.queryByText("CG-2026-0002")).not.toBeInTheDocument();

    // Filter back to All
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("CG-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("CG-2026-0002")).toBeInTheDocument();
  });

  it("shows paging disclosure and paginates items when exceeding page size", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 15 }, (_, i) => createItem(i + 1));
    const data: FieldValidationQueueData = {
      queue: "needs_visit",
      count: 15,
      total: 15,
      oldest: items[0],
      items,
    };

    renderPanel(data);

    expect(screen.getByText(/Showing 1–10 of 15/)).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("CG-2026-0001")).toBeInTheDocument();
    expect(screen.queryByText("CG-2026-0015")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText(/Showing 11–15 of 15/)).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("CG-2026-0015")).toBeInTheDocument();
    expect(screen.queryByText("CG-2026-0001")).not.toBeInTheDocument();
  });
});
