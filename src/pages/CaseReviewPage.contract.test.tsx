import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "../config/env";
import { reportDetailDto } from "../test/fixtures";
import { server } from "../test/server";
import { CaseReviewPage } from "./CaseReviewPage";

/**
 * PROTECTED CONTRACT TESTS - Report Evidence Review.
 *
 * These assertions encode the approved feature contract, not the current UI.
 * Do not weaken, delete, skip, or rewrite them merely to make an implementation
 * pass. Contract disagreements must return to specification.
 */
const apiBase = env.apiBaseUrl;
const validatedAdvisory = {
  uuid: "advisory-validated-001",
  code: "ADV-VALID-001",
  title: "Document and monitor affected rows",
  content: "Mark affected rows and record visible changes.",
  status: "validated",
  validation_provenance: "Approved for office use.",
  validated_at: "2026-09-01T08:00:00.000Z",
};
const draftAdvisory = {
  ...validatedAdvisory,
  uuid: "advisory-draft-001",
  code: "ADV-DRAFT-001",
  title: "Draft guidance",
  status: "draft",
  validated_at: null,
};
const retiredAdvisory = {
  ...validatedAdvisory,
  uuid: "advisory-retired-001",
  code: "ADV-RETIRED-001",
  title: "Retired guidance",
  status: "retired",
};

type ReviewPayload = Record<string, unknown>;
let reviewPayloads: ReviewPayload[] = [];
let currentReport: Record<string, unknown>;

function installApi() {
  currentReport = reportDetailDto as unknown as Record<string, unknown>;
  server.use(
    http.get(
      `${apiBase}/api/v1/reports/${reportDetailDto.identity.uuid}`,
      () => HttpResponse.json({ data: currentReport }),
    ),
    http.get(
      `${apiBase}/api/v1/reports/${reportDetailDto.identity.uuid}/possible-matches`,
      () => HttpResponse.json({
        data: [],
        message: "No possible recent match was found for this case.",
        meta: {
          possible_match: false,
          can_submit: true,
          assessment: "condition_and_location",
          recent_window_hours: 72,
          location_radius_meters: 100,
        },
      }),
    ),
    http.get(`${apiBase}/api/v1/field-reporters`, () =>
      HttpResponse.json({
        data: [{
          uuid: reportDetailDto.reporter.uuid,
          name: reportDetailDto.reporter.name,
        }],
      }),
    ),
    http.get(`${apiBase}/api/v1/advisories`, () =>
      HttpResponse.json({ data: [validatedAdvisory, draftAdvisory, retiredAdvisory] }),
    ),
    http.patch(
      `${apiBase}/api/v1/reports/${reportDetailDto.identity.uuid}/review`,
      async ({ request }) => {
        const payload = (await request.json()) as ReviewPayload;
        reviewPayloads.push(payload);
        currentReport = {
          ...reportDetailDto,
          review: {
            ...reportDetailDto.review,
            notes: payload.notes ?? reportDetailDto.review.notes,
            authority_classified_condition:
              payload.authority_classified_condition ??
              reportDetailDto.review.authority_classified_condition,
            action_taken:
              payload.action_taken ?? reportDetailDto.review.action_taken,
          },
          lifecycle: {
            ...reportDetailDto.lifecycle,
            case_state: payload.case_state ?? reportDetailDto.lifecycle.case_state,
            verification_outcome:
              payload.verification_outcome ??
              reportDetailDto.lifecycle.verification_outcome,
            field_validation_state:
              payload.field_validation_state ??
              reportDetailDto.lifecycle.field_validation_state,
          },
          version: reportDetailDto.version + 1,
        } as unknown as Record<string, unknown>;
        return HttpResponse.json({ data: currentReport });
      },
    ),
  );
}

function renderCaseReview() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/reports/${reportDetailDto.identity.uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
          <Route path="/reports" element={<p>Submitted reports queue</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function loadCase() {
  renderCaseReview();
  await screen.findByRole("heading", {
    level: 1,
    name: reportDetailDto.identity.reference_code,
  });
}

async function clickChoice(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
) {
  const radio = screen.queryByRole("radio", { name });
  if (radio) return user.click(radio);
  const button = screen.queryByRole("button", { name });
  if (button) return user.click(button);
  throw new Error(`No accessible choice found for ${String(name)}`);
}

describe("Report Evidence Review protected contract", () => {
  beforeEach(() => {
    reviewPayloads = [];
    installApi();
  });

  it("CT-01 exposes one progressive Evidence -> Finding -> Action -> Summary -> Confirm flow without a normal-review modal", async () => {
    await loadCase();

    const evidence = screen.getByRole("heading", { name: "Evidence Summary" });
    const staffFinding = screen.getByLabelText(/Staff-Classified Condition/i);
    const verification = screen.getByLabelText(/Verification Outcome/i);
    const actions = screen.getByRole("group", { name: /What should happen next/i });
    const summary = screen.getByRole("heading", { name: /Review Summary|Decision Summary/i });
    const confirm = screen.getByRole("button", { name: "Confirm Review" });

    expect(evidence.compareDocumentPosition(staffFinding) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(staffFinding.compareDocumentPosition(verification) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(verification.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /Record office decision/i })).not.toBeInTheDocument();
  });

  it("CT-02 shows the balanced Evidence Summary and keeps full report detail secondary", async () => {
    await loadCase();

    const evidence = screen.getByRole("region", { name: "Evidence Summary" });
    expect(within(evidence).getByRole("img", {
      name: `Submitted sugarcane photo for ${reportDetailDto.identity.reference_code}`,
    })).toBeInTheDocument();
    expect(within(evidence).getByText(/Possible Condition/i)).toBeInTheDocument();
    expect(within(evidence).getByText(/Dark whip-like growths/i)).toBeInTheDocument();
    expect(within(evidence).getByText(/PSR 86/)).toBeInTheDocument();
    expect(within(evidence).getByText(/6 months/)).toBeInTheDocument();
    expect(within(evidence).getByText(/Class A/)).toBeInTheDocument();
    expect(within(evidence).getByText(/12.5 ha/)).toBeInTheDocument();
    expect(within(evidence).getByText(/42.75%/)).toBeInTheDocument();
    expect(within(evidence).getByText(/Balaytigui/)).toBeInTheDocument();
    expect(screen.getByText("View Full Report Details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeInTheDocument();
  });

  it("CT-03 blocks Verified when Staff-Classified Condition is empty", async () => {
    const user = userEvent.setup();
    await loadCase();

    await user.selectOptions(screen.getByLabelText(/Verification Outcome/i), "verified");
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    expect(await screen.findByText(/Staff-Classified Condition.*required/i)).toBeInTheDocument();
    expect(reviewPayloads).toHaveLength(0);
  });

  it("CT-04 disallows sending a Verified case for Field Validation", async () => {
    const user = userEvent.setup();
    await loadCase();

    await user.selectOptions(screen.getByLabelText(/Verification Outcome/i), "verified");
    await clickChoice(user, /Needs Field Validation/i);

    expect(await screen.findByText(/Field Validation.*Not Determined|Not Determined.*Field Validation/i)).toBeInTheDocument();
    expect(reviewPayloads).toHaveLength(0);
  });

  it("CT-05 exposes exactly three top-level actions and no active expert referral", async () => {
    await loadCase();

    const actions = screen.getByRole("group", { name: /What should happen next/i });
    expect(within(actions).getByText("Needs Field Validation")).toBeInTheDocument();
    expect(within(actions).getByText("Provide Advisory or Assistance")).toBeInTheDocument();
    expect(within(actions).getByText("No Further Action")).toBeInTheDocument();
    expect(within(actions).queryByText(/Refer to Expert/i)).not.toBeInTheDocument();
    expect(within(actions).queryByText(/^Technical Assistance$/i)).not.toBeInTheDocument();
  });

  it("CT-06 requires a validated advisory and maps Advisory Guidance correctly", async () => {
    const user = userEvent.setup();
    await loadCase();

    await clickChoice(user, "Provide Advisory or Assistance");
    await clickChoice(user, "Advisory Guidance");

    expect(screen.getByRole("option", { name: /ADV-VALID-001/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /ADV-DRAFT-001/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /ADV-RETIRED-001/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(reviewPayloads).toHaveLength(0);

    const option = screen.getByRole("option", { name: /ADV-VALID-001/i });
    const select = option.parentElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    await user.selectOptions(select as HTMLSelectElement, validatedAdvisory.uuid);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    await waitFor(() => expect(reviewPayloads).toHaveLength(1));
    expect(reviewPayloads[0]).toMatchObject({
      expected_version: reportDetailDto.version,
      action_taken: "advisory_provided",
      advisory_uuid: validatedAdvisory.uuid,
    });
    expect(reviewPayloads[0].case_state ?? "open").toBe("open");
  });

  it("CT-07 requires meaningful Technical Assistance details and preserves case state", async () => {
    const user = userEvent.setup();
    await loadCase();

    await clickChoice(user, "Provide Advisory or Assistance");
    await clickChoice(user, "Technical Assistance");
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(reviewPayloads).toHaveLength(0);

    const details = screen.getByRole("textbox", {
      name: /Technical Assistance|Assistance details/i,
    });
    await user.type(details, "Demonstrated field sanitation and documented the next inspection step.");
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    await waitFor(() => expect(reviewPayloads).toHaveLength(1));
    expect(reviewPayloads[0]).toMatchObject({
      expected_version: reportDetailDto.version,
      action_taken: "technical_assistance_provided",
      notes: "Demonstrated field sanitation and documented the next inspection step.",
    });
    expect(reviewPayloads[0].case_state ?? "open").toBe("open");
  });

  it("CT-08 makes No Further Action non-destructive until explicit close confirmation and Confirm Review", async () => {
    const user = userEvent.setup();
    await loadCase();

    await clickChoice(user, "No Further Action");
    expect(reviewPayloads).toHaveLength(0);
    expect(screen.getByText(/Confirming this review will close the case/i)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Close this case|confirm.*close/i }));
    expect(reviewPayloads).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    await waitFor(() => expect(reviewPayloads).toHaveLength(1));
    expect(reviewPayloads[0]).toMatchObject({
      expected_version: reportDetailDto.version,
      action_taken: "no_further_action_required",
      case_state: "closed",
    });
  });

  it("CT-09 expands Field Validation inline, requires an inspector, and keeps verification Not Determined", async () => {
    const user = userEvent.setup();
    await loadCase();

    await clickChoice(user, "Needs Field Validation");
    expect(screen.queryByRole("dialog", { name: /Assign visit/i })).not.toBeInTheDocument();

    const assignee = screen.getByLabelText(/Field Inspector/i);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(reviewPayloads).toHaveLength(0);

    await user.selectOptions(assignee, reportDetailDto.reporter.uuid);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    await waitFor(() => expect(reviewPayloads).toHaveLength(1));
    expect(reviewPayloads[0]).toMatchObject({
      expected_version: reportDetailDto.version,
      field_validation_state: "assigned",
      field_validation_assignee_uuid: reportDetailDto.reporter.uuid,
    });
    expect(reviewPayloads[0].verification_outcome ?? "not_determined").toBe("not_determined");
    expect(reviewPayloads[0].case_state ?? "open").toBe("open");
  });

  it("CT-10 shows an inline decision summary and stays on the case after successful review", async () => {
    const user = userEvent.setup();
    await loadCase();

    await clickChoice(user, "Provide Advisory or Assistance");
    await clickChoice(user, "Technical Assistance");
    await user.type(
      screen.getByRole("textbox", { name: /Technical Assistance|Assistance details/i }),
      "Recorded practical field assistance.",
    );

    const summary = screen.getByRole("region", { name: /Review Summary|Decision Summary/i });
    expect(within(summary).getByText(/Possible Condition/i)).toBeInTheDocument();
    expect(within(summary).getByText(/Provide Advisory or Assistance/i)).toBeInTheDocument();
    expect(within(summary).getByText(/Technical Assistance/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await waitFor(() => expect(reviewPayloads).toHaveLength(1));

    expect(screen.getByRole("heading", {
      level: 1,
      name: reportDetailDto.identity.reference_code,
    })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Review Next Case" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Queue" })).toBeInTheDocument();
  });
});
