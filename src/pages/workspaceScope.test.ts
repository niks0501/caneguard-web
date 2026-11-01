import { describe, expect, it } from "vitest";
import {
  monitoringViewFromUrl,
  monitoringViewLink,
  scopeNoticeMessage,
} from "./workspaceScope";

describe("workspace scope", () => {
  it("keeps the Overdue queue and barangay when opening the register", () => {
    const params = new URLSearchParams("view=map&queue=follow_up_due&barangay=Bucana&report=case-1");

    const link = monitoringViewLink("register", params);

    expect(link.removed).toEqual([]);
    expect(link.to).toBe("/monitoring?queue=follow_up_due&barangay=Bucana&view=register");
  });

  it("keeps the Overdue queue and barangay when opening the map", () => {
    const params = new URLSearchParams("queue=follow_up_due&barangay=Bucana&status=for_field_validation");

    const link = monitoringViewLink("map", params);

    expect(link.removed).toEqual([]);
    expect(link.to).toBe("/monitoring?queue=follow_up_due&status=for_field_validation&barangay=Bucana&view=map");
  });

  it("names the exact filter a view cannot honor instead of dropping it silently", () => {
    const params = new URLSearchParams("queue=upcoming&location=unlocated&search=bucana");

    const link = monitoringViewLink("map", params);

    expect(link.removed).toEqual(["Map location", "Search"]);
    expect(link.to).toBe("/monitoring?queue=upcoming&view=map");
    expect(scopeNoticeMessage(link.removed)).toBe("Not applied in this view: Map location, Search.");
  });

  it("reports every work filter removed by a view that accepts none", () => {
    const params = new URLSearchParams("queue=follow_up_due&barangay=Bucana&date_from=2026-09-01&reviewer=abc");

    const link = monitoringViewLink("field-operations", params);

    expect(link.to).toBe("/monitoring?view=field-operations");
    expect(link.removed).toEqual(["Queue", "Barangay", "From date", "Field Inspector"]);
  });

  it("keeps calendar month state only for the calendar view", () => {
    const params = new URLSearchParams("queue=upcoming&calendar_month=2026-09");

    expect(monitoringViewLink("calendar", params).to).toBe("/monitoring?calendar_month=2026-09&view=calendar");
    expect(monitoringViewLink("map", params).to).toBe("/monitoring?queue=upcoming&view=map");
  });

  it("drops an unknown queue value and says so", () => {
    const link = monitoringViewLink("map", new URLSearchParams("queue=not_a_queue"));

    expect(link.to).toBe("/monitoring?view=map");
    expect(link.removed).toEqual(["Queue"]);
  });

  it("names a queue the map cannot represent instead of sending an invalid filter", () => {
    const link = monitoringViewLink("map", new URLSearchParams("queue=needs_review&barangay=Bucana"));

    expect(link.to).toBe("/monitoring?barangay=Bucana&view=map");
    expect(link.removed).toEqual(["Queue"]);
    expect(scopeNoticeMessage(link.removed)).toBe("Not applied in this view: Queue.");
  });

  it("keeps the register's own queues, including the unverified gap", () => {
    const link = monitoringViewLink("register", new URLSearchParams("queue=unverified_no_active_work"));

    expect(link.to).toBe("/monitoring?queue=unverified_no_active_work&view=register");
    expect(link.removed).toEqual([]);
  });

  it("carries the register's own filters back into the register view", () => {
    const params = new URLSearchParams(
      "view=map&queue=follow_up_due&search=bucana&case_state=open&workflow_status=needs_visit&reviewer=abc&sort=oldest",
    );

    const link = monitoringViewLink("register", params);

    expect(link.removed).toEqual([]);
    expect(link.to).toBe(
      "/monitoring?queue=follow_up_due&search=bucana&case_state=open&workflow_status=needs_visit&reviewer=abc&sort=oldest&view=register",
    );
  });

  it("names a removed filter once even when two URL keys mean Status", () => {
    const link = monitoringViewLink(
      "field-operations",
      new URLSearchParams("status=for_field_validation&workflow_status=needs_visit"),
    );

    expect(link.removed).toEqual(["Status"]);
  });
});

describe("monitoring default view", () => {
  it("opens the map for a bare or fully map-compatible URL", () => {
    expect(monitoringViewFromUrl(new URLSearchParams())).toBe("map");
    expect(monitoringViewFromUrl(new URLSearchParams("queue=follow_up_due&barangay=Bucana"))).toBe("map");
    expect(monitoringViewFromUrl(new URLSearchParams("status=for_field_validation&date_from=2026-09-01"))).toBe("map");
  });

  it("keeps a legacy filtered deep link on the List that can honor it", () => {
    expect(monitoringViewFromUrl(new URLSearchParams("concern=rssi"))).toBe("register");
    expect(monitoringViewFromUrl(new URLSearchParams("search=bucana"))).toBe("register");
    expect(monitoringViewFromUrl(new URLSearchParams("sort=oldest"))).toBe("register");
    expect(monitoringViewFromUrl(new URLSearchParams("queue=needs_review"))).toBe("register");
    expect(monitoringViewFromUrl(new URLSearchParams("location=unlocated"))).toBe("register");
    expect(monitoringViewFromUrl(new URLSearchParams("view=not_a_view&concern=rssi"))).toBe("register");
  });

  it("honors an explicit view over the URL's scope", () => {
    expect(monitoringViewFromUrl(new URLSearchParams("view=calendar&calendar_month=2026-09"))).toBe("calendar");
    expect(monitoringViewFromUrl(new URLSearchParams("view=map&concern=rssi"))).toBe("map");
    expect(monitoringViewFromUrl(new URLSearchParams("view=field-operations"))).toBe("field-operations");
    expect(monitoringViewFromUrl(new URLSearchParams("view=boundaries"))).toBe("boundaries");
  });
});
