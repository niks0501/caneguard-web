import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../test/server";
import { OfficialRecipients } from "./OfficialRecipients";

const url = "http://localhost:8000/api/v1/district-recipient-sets";
const current = { id: 2, recipients: ["a@example.test"], office_reference: "ref-2", created_at: "2026-11-03T02:00:00Z", revoked_at: null };
const old = { id: 1, recipients: ["b@example.test", "c@example.test"], office_reference: "ref-1", created_at: "2026-10-01T02:00:00Z", revoked_at: "2026-11-03T02:00:00Z" };
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OfficialRecipients /></QueryClientProvider>);
}

describe("official recipients", () => {
  it("shows the empty state, then the current set and revoked history", async () => {
    server.use(http.get(url, () => HttpResponse.json({ data: [] })));
    show();
    expect(await screen.findByText("No official recipients configured.")).toBeInTheDocument();
  });
  it("lists the current set and its history", async () => {
    server.use(http.get(url, () => HttpResponse.json({ data: [current, old] })));
    show();
    expect(await screen.findByText("a@example.test")).toBeInTheDocument();
    expect(screen.getByText(/History \(1\)/)).toBeInTheDocument();
  });
  it("rejects invalid emails and more than 20 locally without calling the API", async () => {
    let posted = 0;
    server.use(http.get(url, () => HttpResponse.json({ data: [] })), http.post(`${url}/replace`, () => { posted++; return HttpResponse.json({ data: [] }); }));
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByRole("textbox", { name: "Recipient emails" }), "good@example.test nope");
    await user.type(screen.getByRole("textbox", { name: "Office decision reference" }), "ref");
    await user.type(screen.getByLabelText("Current password"), "pw");
    await user.click(screen.getByRole("button", { name: "Replace recipients" }));
    expect(await screen.findByText(/"nope" is not a valid email address/)).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Recipient emails" }));
    await user.type(screen.getByRole("textbox", { name: "Recipient emails" }), Array.from({ length: 21 }, (_, i) => `u${i}@example.test`).join(" "));
    await user.click(screen.getByRole("button", { name: "Replace recipients" }));
    expect(await screen.findByText("Enter 1 to 20 email addresses.")).toBeInTheDocument();
    expect(posted).toBe(0);
  });
  it("sends the parsed list with reference and password, then clears the password", async () => {
    let body: unknown;
    server.use(http.get(url, () => HttpResponse.json({ data: [current] })), http.post(`${url}/replace`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: [current] }); }));
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByRole("textbox", { name: "Recipient emails" }), "x@example.test, y@example.test;\nz@example.test");
    await user.type(screen.getByRole("textbox", { name: "Office decision reference" }), "ref-3");
    await user.type(screen.getByLabelText("Current password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Replace recipients" }));
    expect(await screen.findByText("Recipients replaced. The previous set is revoked.")).toBeInTheDocument();
    expect(body).toEqual({ recipients: ["x@example.test", "y@example.test", "z@example.test"], office_reference: "ref-3", current_password: "synthetic-password" });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });
});
