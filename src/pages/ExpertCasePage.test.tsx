import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { server } from "../test/server";
import { ExpertCasePage } from "./ExpertCasePage";

const baseUrl = "http://localhost:8000";
const reportUuid = "7e8c2e48-a2d4-4aca-9a50-9ca460fd7a7f";
const submittedAt = "2026-09-20T10:00:00.000Z";
const photoUrl = `${baseUrl}/api/v1/reports/${reportUuid}/image`;
const observations = {
  symptom_keys: ["leaf_spots"],
  reporter_observation_text: "Spots are visible on the submitted leaves.",
  field_notes: "The affected leaves were photographed in daylight.",
  reporter_suspected_condition: "smut",
  checklist_consistency: "consistent",
  reported_severity: "moderate",
  quality_warnings: [],
};
const aiPossibleCondition = {
  label: "smut",
  predicted_label: "smut",
  decision_support_label: "Decision-support only. This is not a diagnosis.",
};
const location = {
  barangay: "Balaytigui",
  municipality: "Nasugbu",
  province: "Batangas",
};
const expertConsultResponse = {
  data: {
    case: {
      uuid: reportUuid,
      reference_code: "CG-2026-0001",
      submitted_at: submittedAt,
      photo_url: photoUrl,
      reporter_observations: observations,
      reporter_suspected_condition: "smut",
      ai_possible_condition: aiPossibleCondition,
      location,
      measurements: {
        affected_area_hectares: null,
        affected_area_measurement: "not_measured",
        affected_portion_percent: null,
        affected_portion_measurement: "not_measured",
      },
    },
    reference_code: "CG-2026-0001",
    submitted_at: submittedAt,
    photo_url: photoUrl,
    reporter_observations: observations,
    reporter_suspected_condition: "smut",
    symptom_keys: ["leaf_spots"],
    ai_possible_condition: aiPossibleCondition,
    location,
    affected_area: {
      value: null,
      unit: "hectares",
      measurement: "not_measured",
    },
    affected_portion: {
      value: null,
      unit: "percent",
      measurement: "not_measured",
    },
    office_context: {
      case_state: "open",
      verification_outcome: "not_determined",
      field_validation_state: "unassigned",
      action_taken: "referred_for_expert_validation",
      authority_classified_condition: null,
      notes: null,
      reviewer: null,
      reviewed_at: null,
    },
    consult: {
      id: 1,
      status: "completed",
      reference: "EXPERT-REF-1",
      referral_date: "2026-09-19",
      due_date: "2026-09-26",
      question: "Review the symptoms and image.",
      expert: { uuid: "expert-1", name: "Assigned Expert" },
      condition_opinion: "smut",
      basis: "The observed symptoms match the submitted evidence.",
      finding_details: "The observed symptoms match the submitted evidence.",
      confidence: "high",
      recommendation: "Monitor nearby rows for additional symptoms.",
      symptom_verdicts: {
        leaf_spots: {
          verdict: "present",
          note: "Visible in the submitted image.",
        },
      },
      response_date: "2026-09-20",
      finding_source: "in_system",
      finding_recorded_at: submittedAt,
    },
    due_date: "2026-09-26",
    question: "Review the symptoms and image.",
    prior_consults: [],
    version: 2,
    share_full_context: false,
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/expert/queue/${reportUuid}`]}>
        <Routes>
          <Route path="/expert/queue/:reportId" element={<ExpertCasePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ExpertCasePage", () => {
  it("loads a recent completed consult by report UUID as a read-only finding", async () => {
    let requestedPath: string | null = null;
    server.use(
      http.get(`${baseUrl}/api/v1/reports/${reportUuid}/consult`, ({ request }) => {
        requestedPath = new URL(request.url).pathname;
        return HttpResponse.json(expertConsultResponse);
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "CG-2026-0001" }),
    ).toBeInTheDocument();
    expect(requestedPath).toBe(`/api/v1/reports/${reportUuid}/consult`);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("The observed symptoms match the submitted evidence.")).toBeInTheDocument();
    expect(screen.getByText("Monitor nearby rows for additional symptoms.")).toBeInTheDocument();
    expect(screen.getByText(/recorded finding is read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save expert finding" })).not.toBeInTheDocument();
  });
});
