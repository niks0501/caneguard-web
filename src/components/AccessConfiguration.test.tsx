import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/server";
import { AccessConfiguration } from "./AccessConfiguration";

const url = "http://localhost:8000/api/v1/access-configuration";

function renderConfiguration() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AccessConfiguration />
    </QueryClientProvider>,
  );
}

describe("office access configuration", () => {
  it("marks unresolved values and displays confirmed district configuration without inventing enforcement", async () => {
    server.use(http.get(url, () => HttpResponse.json({ data: {
      staff_approver: { label: "Assigned", placeholder: false },
      pilot_district: { label: "Office-confirmed pilot", placeholder: false },
      district_enforcement: false,
    } })));
    renderConfiguration();
    expect(await screen.findByText("Office-confirmed pilot")).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
    expect(screen.queryByText(/DISTRICT_TBD/)).not.toBeInTheDocument();
    expect(screen.getByText("District boundaries are not enforced in phase 1.")).toBeInTheDocument();
  });

  it("shows an honest error and can retry rather than treating failure as placeholder confirmation", async () => {
    server.use(http.get(url, () => HttpResponse.error()));
    renderConfiguration();
    expect(await screen.findByRole("alert")).toHaveTextContent("Office access configuration unavailable.");
    expect(screen.queryByText(/To be assigned/)).not.toBeInTheDocument();
    server.use(http.get(url, () => HttpResponse.json({ data: {
      staff_approver: { label: "To be assigned", placeholder: true },
      pilot_district: { label: "To be assigned", placeholder: true },
      district_enforcement: false,
    } })));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("To be assigned (APPROVER_TBD)")).toBeInTheDocument();
    expect(screen.getByText("To be assigned (DISTRICT_TBD)")).toBeInTheDocument();
  });
});
