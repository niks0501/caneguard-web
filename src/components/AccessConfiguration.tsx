import { useQuery } from "@tanstack/react-query";
import { getAccessConfiguration } from "../auth/auth.api";

export function AccessConfiguration() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["access-configuration"],
    queryFn: getAccessConfiguration,
    retry: false,
  });

  if (isPending) return <p className="auth-form__hint" role="status">Loading office access configuration...</p>;
  if (isError || !data) {
    return (
      <p className="auth-form__hint" role="alert">
        Office access configuration unavailable.{" "}
        <button type="button" className="auth-inline-link" onClick={() => void refetch()}>Retry</button>
      </p>
    );
  }

  return (
    <section className="access-configuration" aria-label="Office access configuration">
      <dl>
        <div>
          <dt>Staff approver</dt>
          <dd>{data.staff_approver.label}{data.staff_approver.placeholder ? " (APPROVER_TBD)" : ""}</dd>
        </div>
        <div>
          <dt>Pilot district</dt>
          <dd>{data.pilot_district.label}{data.pilot_district.placeholder ? " (DISTRICT_TBD)" : ""}</dd>
        </div>
      </dl>
      <p className="auth-form__hint">District boundaries are not enforced in phase 1.</p>
    </section>
  );
}
