import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "../../test/server";
import { WeeklyReportingSettings } from "./WeeklyReportingSettings";

const url = "http://localhost:8000/api/v1/district-reporting-settings";
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WeeklyReportingSettings /></QueryClientProvider>);
}
describe("weekly reporting schedule settings", () => {
  beforeEach(() => {
    server.use(http.get(url, () => HttpResponse.json({
      data: {
        reminder_day: null,
        reminder_time: null,
        auto_generate_enabled: true,
        auto_generate_day: 1,
        auto_generate_time: "06:00",
        timezone: "Asia/Manila",
        can_manage: false,
      },
    })));
  });

  it("shows default Monday 6:00 AM PHT auto-generation and never gives reviewers management controls", async () => {
    show();
    expect(await screen.findByText("Auto-generation: Monday at 6:00 AM PHT")).toBeInTheDocument();
    expect(screen.getByText("Current schedule: Not configured")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save reporting schedule" })).not.toBeInTheDocument();
    expect(screen.getByText(/never approves or sends a report automatically/)).toBeInTheDocument();
  });

  it("restores saved 12-hour schedules and saves auto-generation + reminder settings with password step-up", async () => {
    let body: unknown;
    server.use(
      http.get(url, () => HttpResponse.json({
        data: {
          reminder_day: 2,
          reminder_time: "13:30",
          auto_generate_enabled: true,
          auto_generate_day: 1,
          auto_generate_time: "06:00",
          timezone: "Asia/Manila",
          can_manage: true,
        },
      })),
      http.put(url, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: {} }); }),
    );
    const user = userEvent.setup();
    show();
    expect(await screen.findByText("Current schedule: Tuesday at 1:30 PM PHT")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Auto-generation day" })).toHaveValue("1");
    expect(screen.getByRole("combobox", { name: "Preparation day" })).toHaveValue("2");
    expect(screen.getByRole("combobox", { name: "Hour" })).toHaveValue("1");
    expect(screen.getByRole("combobox", { name: "AM or PM" })).toHaveValue("PM");
    await user.type(screen.getByRole("textbox", { name: "Office decision reference" }), "synthetic-office-reference");
    await user.type(screen.getByLabelText("Current password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Save reporting schedule" }));
    expect(await screen.findByText("Reporting schedule saved. Download verified reports to send via Gmail.")).toBeInTheDocument();
    expect(body).toEqual({
      auto_generate_enabled: true,
      auto_generate_day: 1,
      auto_generate_time: "06:00",
      reminder_day: 2,
      reminder_time: "13:30",
      office_reference: "synthetic-office-reference",
      current_password: "synthetic-password",
    });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });
});
