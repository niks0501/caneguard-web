import { lazy } from "react";
import { Navigate, useSearchParams } from "react-router";
import { SubmittedReportsPage } from "../pages/SubmittedReportsPage";
import { routes } from "./routes";

export const FieldValidationMapPage = lazy(() =>
  import("../pages/FieldValidationMapPage").then(({ FieldValidationMapPage }) => ({
    default: FieldValidationMapPage,
  })),
);

/** The retired `/reports?queue=` entry points land on the matching To do lane. */
const queueRedirects: Record<string, string> = {
  needs_review: routes.todoLane("review"),
  needs_visit: routes.todoLane("send"),
  unverified_no_active_work: routes.todoLane("send"),
  follow_up_due: routes.todoLane("overdue"),
  upcoming: `${routes.monitoring}?queue=upcoming&view=register`,
};

export function ReportsRoute() {
  const [params] = useSearchParams();
  const target = queueRedirects[params.get("queue") ?? ""];
  return target ? <Navigate replace to={target} /> : <SubmittedReportsPage />;
}
