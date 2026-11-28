import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { knownBarangays } from "../../domain/locationScope";
import { formatDateTime } from "../../lib/formatters";
import {
  listFarmerBroadcasts,
  listValidatedAdvisories,
  publishFarmerBroadcast,
  retireFarmerBroadcast,
} from "../../services/farmerBroadcasts.api";
import type {
  BroadcastCommand,
  BroadcastReachMeta,
  FarmerBroadcast,
} from "../../services/farmerBroadcasts.api";
import { Button } from "../ui/Button";
import { SearchInput, SelectFilter } from "../ui/FormControls";
import { Modal } from "../ui/Modal";
import { confirmDiscardUnsavedChanges } from "../ui/confirmDiscard";
import { ErrorState, LoadingState } from "../ui/States";

type BroadcastStatus = "live" | "withdrawn" | "ended";
type StatusFilter = "all" | BroadcastStatus;

const HEADLINE_MAX = 160;
const BODY_MAX = 2000;

const emptyForm = {
  advisory_uuid: "",
  headline_tl: "",
  headline_en: "",
  body_tl: "",
  body_en: "",
  all: true,
  barangays: [] as string[],
  expires_in_days: 14,
};

function broadcastStatus(row: FarmerBroadcast): BroadcastStatus {
  if (row.live) return "live";
  if (row.retired_at) return "withdrawn";
  return "ended";
}

function broadcastStatusLabel(status: BroadcastStatus): string {
  if (status === "live") return "Live";
  if (status === "withdrawn") return "Withdrawn";
  return "Ended";
}

function formatBarangayTarget(barangays: string[] | null): string {
  if (barangays === null) return "All barangays";
  if (barangays.length <= 4) return barangays.join(", ");
  return `${barangays.slice(0, 3).join(", ")} +${barangays.length - 3} more`;
}

function farmerCountLabel(count: number): string {
  return count === 1 ? "1 verified farmer" : `${count} verified farmers`;
}

export function FarmerBroadcastsSection() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewing, setViewing] = useState<FarmerBroadcast | null>(null);
  const [withdrawing, setWithdrawing] = useState<FarmerBroadcast | null>(null);
  const [withdrawingPending, setWithdrawingPending] = useState(false);

  const query = useQuery({
    queryKey: ["farmer-broadcasts", user?.uuid],
    queryFn: ({ signal }) => listFarmerBroadcasts(signal),
    retry: false,
    gcTime: 0,
  });

  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const reachMeta = query.data?.meta ?? null;

  const statusCounts = useMemo(() => {
    const counts = { all: rows.length, live: 0, withdrawn: 0, ended: 0 };
    for (const row of rows) {
      counts[broadcastStatus(row)] += 1;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && broadcastStatus(row) !== statusFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      const haystack = [
        row.headline_en,
        row.headline_tl,
        row.advisory.code,
        row.advisory.title,
        row.barangays === null ? "all barangays" : row.barangays.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [rows, searchQuery, statusFilter]);

  const refresh = () => client.invalidateQueries({ queryKey: ["farmer-broadcasts"] });

  async function confirmRetire() {
    if (!withdrawing || withdrawingPending) return;
    setWithdrawingPending(true);
    setNotice("");
    try {
      await retireFarmerBroadcast(withdrawing.uuid);
      setWithdrawing(null);
      setNotice("Broadcast withdrawn.");
    } catch {
      setWithdrawing(null);
      setNotice("Not confirmed. Reload the list and check the broadcast before trying again.");
    } finally {
      setWithdrawingPending(false);
    }
    await refresh();
  }

  return (
    <section className="accounts-field" aria-label="Barangay broadcasts">
      {notice ? <p role="status">{notice}</p> : null}
      <div className="broadcast-toolbar">
        <div className="broadcast-toolbar__filters">
          <div className="broadcast-filter-pills" role="group" aria-label="Filter broadcasts by status">
            {(["all", "live", "withdrawn", "ended"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                className="broadcast-filter-pill"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                <span>{status === "all" ? "All" : broadcastStatusLabel(status)}</span>
                <span className="broadcast-filter-pill__count">({statusCounts[status]})</span>
              </button>
            ))}
          </div>
          <SearchInput
            label="Search broadcasts"
            className="broadcast-search"
            placeholder="Search headlines, advisories, or barangays…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <Button onClick={() => { setNotice(""); setOpen(true); }}>Publish broadcast</Button>
      </div>

      {query.isPending ? (
        <LoadingState message="Loading broadcasts…" />
      ) : query.isError ? (
        <ErrorState message="Broadcasts could not be loaded." onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <p role="status">No broadcasts.</p>
      ) : filteredRows.length === 0 ? (
        <div className="broadcast-empty-filter" role="status">
          <p>No broadcasts match the current filter.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => { setStatusFilter("all"); setSearchQuery(""); }}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <table className="report-table accounts-table broadcast-table">
          <caption className="sr-only">Barangay broadcasts</caption>
          <thead>
            <tr>
              <th scope="col">Headline</th>
              <th scope="col">Barangays</th>
              <th scope="col">Farmers reached</th>
              <th scope="col">Expires</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const status = broadcastStatus(row);
              return (
                <tr key={row.uuid}>
                  <td data-label="Headline">
                    <strong>{row.headline_en}</strong>
                    <span className="broadcast-headline-tl">{row.headline_tl}</span>
                    <small className="broadcast-advisory-code">{row.advisory.code}</small>
                  </td>
                  <td
                    data-label="Barangays"
                    title={row.barangays === null ? "All barangays" : row.barangays.join(", ")}
                  >
                    {formatBarangayTarget(row.barangays)}
                  </td>
                  <td data-label="Farmers reached">{row.reach}</td>
                  <td data-label="Expires">{formatDateTime(row.expires_at)}</td>
                  <td data-label="Status">
                    <span className={`broadcast-status-badge broadcast-status-badge--${status}`}>
                      {broadcastStatusLabel(status)}
                    </span>
                  </td>
                  <td data-label="Action">
                    <div className="broadcast-row-actions">
                      <Button
                        type="button"
                        variant="quiet"
                        aria-label={`View ${row.headline_en}`}
                        onClick={() => setViewing(row)}
                      >
                        View message
                      </Button>
                      {row.live ? (
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Withdraw ${row.headline_en}`}
                          onClick={() => setWithdrawing(row)}
                        >
                          Withdraw
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {open ? (
        <PublishDialog
          reachMeta={reachMeta}
          onClose={() => setOpen(false)}
          onPublished={async () => {
            setOpen(false);
            setNotice("Broadcast published.");
            await refresh();
          }}
        />
      ) : null}

      {viewing ? (
        <BroadcastDetailModal
          broadcast={viewing}
          onClose={() => setViewing(null)}
          onRequestWithdraw={(row) => {
            setViewing(null);
            setWithdrawing(row);
          }}
        />
      ) : null}

      {withdrawing ? (
        <WithdrawConfirmModal
          broadcast={withdrawing}
          pending={withdrawingPending}
          onClose={() => { if (!withdrawingPending) setWithdrawing(null); }}
          onConfirm={() => void confirmRetire()}
        />
      ) : null}
    </section>
  );
}

function BroadcastDetailModal({
  broadcast,
  onClose,
  onRequestWithdraw,
}: {
  broadcast: FarmerBroadcast;
  onClose: () => void;
  onRequestWithdraw: (row: FarmerBroadcast) => void;
}) {
  const status = broadcastStatus(broadcast);
  return (
    <Modal
      id="view-broadcast"
      title="Broadcast message"
      description={`${broadcast.advisory.code} · ${broadcast.advisory.title}`}
      open
      onClose={onClose}
      className="broadcast-modal"
      footer={(
        <>
          {broadcast.live ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onRequestWithdraw(broadcast)}
            >
              Withdraw broadcast
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>Done</Button>
        </>
      )}
    >
      <div className="broadcast-detail-grid">
        <dl className="broadcast-detail-meta">
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`broadcast-status-badge broadcast-status-badge--${status}`}>
                {broadcastStatusLabel(status)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Farmers reached</dt>
            <dd>{farmerCountLabel(broadcast.reach)}</dd>
          </div>
          <div>
            <dt>Target barangays</dt>
            <dd>{broadcast.barangays === null ? "All barangays" : broadcast.barangays.join(", ")}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{formatDateTime(broadcast.published_at)}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{formatDateTime(broadcast.expires_at)}</dd>
          </div>
          {broadcast.retired_at ? (
            <div>
              <dt>Withdrawn</dt>
              <dd>{formatDateTime(broadcast.retired_at)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="broadcast-detail-copy">
          <section className="broadcast-detail-lang" aria-label="Tagalog message">
            <h3>Tagalog (farmer default)</h3>
            <h4>{broadcast.headline_tl}</h4>
            <p>{broadcast.body_tl}</p>
          </section>
          <section className="broadcast-detail-lang" aria-label="English message">
            <h3>English</h3>
            <h4>{broadcast.headline_en}</h4>
            <p>{broadcast.body_en}</p>
          </section>
        </div>
      </div>
    </Modal>
  );
}

function WithdrawConfirmModal({
  broadcast,
  pending,
  onClose,
  onConfirm,
}: {
  broadcast: FarmerBroadcast;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      id="withdraw-broadcast"
      title="Withdraw broadcast"
      description="This stops the message from showing on farmers' phones after their next sync. Office history is kept."
      open
      onClose={onClose}
      disabled={pending}
      footer={(
        <>
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Keep live
          </Button>
          <Button type="button" variant="danger" disabled={pending} onClick={onConfirm}>
            {pending ? "Withdrawing…" : "Confirm withdraw"}
          </Button>
        </>
      )}
    >
      <div className="broadcast-withdraw-summary">
        <p><strong>{broadcast.headline_en}</strong></p>
        <p>{broadcast.headline_tl}</p>
        <p>
          <strong>Target:</strong>{" "}
          {broadcast.barangays === null ? "All barangays" : broadcast.barangays.join(", ")} (
          {farmerCountLabel(broadcast.reach)})
        </p>
      </div>
    </Modal>
  );
}

function PublishDialog({
  reachMeta,
  onClose,
  onPublished,
}: {
  reachMeta: BroadcastReachMeta | null;
  onClose: () => void;
  onPublished: () => Promise<void>;
}) {
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [barangayQuery, setBarangayQuery] = useState("");
  const [previewLang, setPreviewLang] = useState<"tl" | "en">("tl");

  const advisories = useQuery({
    queryKey: ["farmer-inquiries", "advisories"],
    queryFn: ({ signal }) => listValidatedAdvisories(signal),
    retry: false,
  });

  const update = (patch: Partial<typeof emptyForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const isDirty = (
    form.advisory_uuid !== emptyForm.advisory_uuid
    || form.headline_tl !== emptyForm.headline_tl
    || form.headline_en !== emptyForm.headline_en
    || form.body_tl !== emptyForm.body_tl
    || form.body_en !== emptyForm.body_en
    || form.all !== emptyForm.all
    || form.barangays.length > 0
    || form.expires_in_days !== emptyForm.expires_in_days
  );

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!form.advisory_uuid) missing.push("validated advisory");
    if (!form.headline_tl.trim()) missing.push("Tagalog headline");
    if (!form.body_tl.trim()) missing.push("Tagalog message");
    if (!form.headline_en.trim()) missing.push("English headline");
    if (!form.body_en.trim()) missing.push("English message");
    if (!form.all && form.barangays.length === 0) missing.push("at least one barangay");
    return missing;
  }, [form]);

  const valid = missingFields.length === 0;

  const filteredBarangays = useMemo(() => {
    const needle = barangayQuery.trim().toLowerCase();
    if (!needle) return knownBarangays;
    return knownBarangays.filter((name) => name.toLowerCase().includes(needle));
  }, [barangayQuery]);

  const estimatedReach = useMemo(() => {
    if (!reachMeta) return null;
    if (form.all) return reachMeta.total_verified_farmers;
    return form.barangays.reduce((sum, name) => sum + (reachMeta.barangay_counts[name] ?? 0), 0);
  }, [form.all, form.barangays, reachMeta]);

  function pick(uuid: string) {
    const advisory = advisories.data?.find((item) => item.uuid === uuid);
    // Start from the validated wording; the office writes the Tagalog.
    update({
      advisory_uuid: uuid,
      headline_en: advisory ? advisory.title : "",
      body_en: advisory ? advisory.content : "",
    });
  }

  function handleCancel() {
    if (pending) return;
    if (!confirmDiscardUnsavedChanges(isDirty)) return;
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !valid) return;
    setPending(true);
    setError("");
    const command: BroadcastCommand = {
      advisory_uuid: form.advisory_uuid,
      headline_tl: form.headline_tl.trim(),
      headline_en: form.headline_en.trim(),
      body_tl: form.body_tl.trim(),
      body_en: form.body_en.trim(),
      all_barangays: form.all,
      barangays: form.all ? [] : form.barangays,
      expires_in_days: form.expires_in_days,
    };
    try {
      await publishFarmerBroadcast(command);
      await onPublished();
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 422
          ? (failure.errors ? Object.values(failure.errors).flat().join(" ") : failure.message)
          : "Not confirmed. Reload the list and check before publishing again.",
      );
    } finally {
      setPending(false);
    }
  }

  const previewHeadline = previewLang === "tl" ? form.headline_tl.trim() : form.headline_en.trim();
  const previewBody = previewLang === "tl" ? form.body_tl.trim() : form.body_en.trim();
  const previewScope = form.all
    ? "All barangays"
    : form.barangays.length === 0
      ? "No barangays selected"
      : form.barangays.length === 1
        ? form.barangays[0]
        : `${form.barangays.length} selected barangays`;

  return (
    <Modal
      id="publish-broadcast"
      title="Publish broadcast"
      description="Share validated guidance in both Tagalog and English with farmers by home barangay."
      open
      isDirty={isDirty}
      disabled={pending}
      className="broadcast-modal"
      onClose={() => { if (!pending) onClose(); }}
    >
      <form className="broadcast-form" onSubmit={submit}>
        {error ? <p role="alert" className="settings-alert settings-alert--error">{error}</p> : null}

        <div className="broadcast-field-group">
          <SelectFilter
            label="Validated advisory"
            value={form.advisory_uuid}
            required
            disabled={pending || advisories.isPending || advisories.isError}
            onChange={(event) => pick(event.target.value)}
          >
            <option value="">
              {advisories.isPending ? "Loading validated advisories…" : "Choose an advisory"}
            </option>
            {(advisories.data ?? []).map((advisory) => (
              <option key={advisory.uuid} value={advisory.uuid}>
                {advisory.code} · {advisory.title}
              </option>
            ))}
          </SelectFilter>

          {advisories.isPending ? (
            <p role="status" className="broadcast-advisory-status">
              Loading validated advisories…
            </p>
          ) : null}

          {advisories.isError ? (
            <div role="alert" className="settings-alert settings-alert--error broadcast-advisory-error">
              <span>Validated advisories could not be loaded.</span>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => void advisories.refetch()}
              >
                Retry advisories
              </Button>
            </div>
          ) : null}

          {!advisories.isPending && !advisories.isError && (advisories.data ?? []).length === 0 ? (
            <p role="status" className="broadcast-advisory-status">
              No validated advisories are available in the library yet. Validate an advisory before publishing.
            </p>
          ) : null}
        </div>

        <div className="broadcast-bilingual-grid">
          <div className="broadcast-lang-column">
            <h3 className="broadcast-lang-column__title">Tagalog (default on farmer phones)</h3>
            <div className="broadcast-field-group">
              <div className="broadcast-field-header">
                <label htmlFor="broadcast-headline-tl">Headline (Tagalog)</label>
                <span className={`broadcast-char-count${form.headline_tl.length >= 140 ? " broadcast-char-count--near" : ""}`}>
                  {form.headline_tl.length}/{HEADLINE_MAX}
                </span>
              </div>
              <input
                id="broadcast-headline-tl"
                type="text"
                maxLength={HEADLINE_MAX}
                value={form.headline_tl}
                disabled={pending}
                placeholder="Maikling pamagat para sa mga magsasaka"
                onChange={(event) => update({ headline_tl: event.target.value })}
              />
            </div>
            <div className="broadcast-field-group">
              <div className="broadcast-field-header">
                <label htmlFor="broadcast-body-tl">Message (Tagalog)</label>
                <span className={`broadcast-char-count${form.body_tl.length >= 1800 ? " broadcast-char-count--near" : ""}`}>
                  {form.body_tl.length}/{BODY_MAX.toLocaleString()}
                </span>
              </div>
              <textarea
                id="broadcast-body-tl"
                rows={4}
                maxLength={BODY_MAX}
                value={form.body_tl}
                disabled={pending}
                placeholder="Malinaw na gabay na mababasa ng magsasaka sa telepono"
                onChange={(event) => update({ body_tl: event.target.value })}
              />
            </div>
          </div>

          <div className="broadcast-lang-column">
            <h3 className="broadcast-lang-column__title">English</h3>
            <div className="broadcast-field-group">
              <div className="broadcast-field-header">
                <label htmlFor="broadcast-headline-en">Headline (English)</label>
                <span className={`broadcast-char-count${form.headline_en.length >= 140 ? " broadcast-char-count--near" : ""}`}>
                  {form.headline_en.length}/{HEADLINE_MAX}
                </span>
              </div>
              <input
                id="broadcast-headline-en"
                type="text"
                maxLength={HEADLINE_MAX}
                value={form.headline_en}
                disabled={pending}
                placeholder="Short headline for farmers"
                onChange={(event) => update({ headline_en: event.target.value })}
              />
            </div>
            <div className="broadcast-field-group">
              <div className="broadcast-field-header">
                <label htmlFor="broadcast-body-en">Message (English)</label>
                <span className={`broadcast-char-count${form.body_en.length >= 1800 ? " broadcast-char-count--near" : ""}`}>
                  {form.body_en.length}/{BODY_MAX.toLocaleString()}
                </span>
              </div>
              <textarea
                id="broadcast-body-en"
                rows={4}
                maxLength={BODY_MAX}
                value={form.body_en}
                disabled={pending}
                placeholder="Clear action guidance farmers can follow in the field"
                onChange={(event) => update({ body_en: event.target.value })}
              />
            </div>
          </div>
        </div>

        <fieldset className="broadcast-reach-fieldset" disabled={pending}>
          <legend>Barangays</legend>
          <div className="broadcast-reach-radios">
            <label className="broadcast-radio-option">
              <input
                type="radio"
                name="reach"
                checked={form.all}
                onChange={() => update({ all: true })}
              />
              <span>All barangays</span>
            </label>
            <label className="broadcast-radio-option">
              <input
                type="radio"
                name="reach"
                checked={!form.all}
                onChange={() => update({ all: false })}
              />
              <span>Selected barangays</span>
            </label>
          </div>

          {estimatedReach !== null ? (
            <p
              role="status"
              className={`broadcast-reach-banner${(form.all || form.barangays.length > 0) && estimatedReach === 0 ? " broadcast-reach-banner--zero" : ""}`}
            >
              {form.all
                ? `Estimated reach: ${farmerCountLabel(estimatedReach)} across all barangays.`
                : form.barangays.length === 0
                  ? "Select at least one barangay to estimate farmer reach."
                  : `Estimated reach: ${farmerCountLabel(estimatedReach)} across ${form.barangays.length} selected ${form.barangays.length === 1 ? "barangay" : "barangays"}.`}
              {(form.all || form.barangays.length > 0) && estimatedReach === 0
                ? " No active verified farmers currently match this selection."
                : ""}
            </p>
          ) : null}

          {!form.all ? (
            <div className="broadcast-barangay-picker">
              <div className="broadcast-barangay-toolbar">
                <SearchInput
                  label="Search barangays"
                  placeholder="Search barangays…"
                  value={barangayQuery}
                  onChange={(event) => setBarangayQuery(event.target.value)}
                />
                <span className="broadcast-barangay-count">
                  {form.barangays.length} of {knownBarangays.length} selected
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || form.barangays.length === knownBarangays.length}
                  onClick={() => update({ barangays: [...knownBarangays] })}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={pending || form.barangays.length === 0}
                  onClick={() => update({ barangays: [] })}
                >
                  Clear
                </Button>
              </div>
              {filteredBarangays.length === 0 ? (
                <p className="broadcast-barangay-empty">
                  No barangays match “{barangayQuery.trim()}”.
                </p>
              ) : (
                <div className="broadcast-barangay-grid">
                  {filteredBarangays.map((name) => {
                    const checked = form.barangays.includes(name);
                    return (
                      <label key={name} className="broadcast-barangay-option">
                        <input
                          type="checkbox"
                          aria-label={name}
                          checked={checked}
                          onChange={(event) =>
                            update({
                              barangays: event.target.checked
                                ? [...form.barangays, name]
                                : form.barangays.filter((item) => item !== name),
                            })
                          }
                        />
                        <span className="broadcast-barangay-option__name">{name}</span>
                        {reachMeta ? (
                          <span className="broadcast-barangay-option__count" aria-hidden="true">
                            {reachMeta.barangay_counts[name] ?? 0}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </fieldset>

        <div className="broadcast-meta-row">
          <SelectFilter
            label="Shown for"
            value={form.expires_in_days}
            disabled={pending}
            onChange={(event) => update({ expires_in_days: Number(event.target.value) })}
          >
            {[7, 14, 30, 60].map((days) => (
              <option key={days} value={days}>{days} days</option>
            ))}
          </SelectFilter>

          <section className="broadcast-preview" aria-label="Farmer phone preview">
            <div className="broadcast-preview__header">
              <p className="broadcast-preview__title">Farmer phone preview</p>
              <div className="broadcast-preview__toggle" role="group" aria-label="Preview language">
                <button
                  type="button"
                  className="broadcast-preview__lang-btn"
                  aria-pressed={previewLang === "tl"}
                  onClick={() => setPreviewLang("tl")}
                >
                  Tagalog
                </button>
                <button
                  type="button"
                  className="broadcast-preview__lang-btn"
                  aria-pressed={previewLang === "en"}
                  onClick={() => setPreviewLang("en")}
                >
                  English
                </button>
              </div>
            </div>
            <div className="broadcast-preview__phone">
              <p className="broadcast-preview__eyebrow">
                {previewLang === "tl" ? "Paalala mula sa opisina" : "From your agriculture office"}
              </p>
              <p className={`broadcast-preview__headline${previewHeadline ? "" : " broadcast-preview__placeholder"}`}>
                {previewHeadline || (previewLang === "tl" ? "Tagalog headline preview" : "English headline preview")}
              </p>
              <p className={`broadcast-preview__body${previewBody ? "" : " broadcast-preview__placeholder"}`}>
                {previewBody || (previewLang === "tl" ? "Tagalog message preview" : "English message preview")}
              </p>
              <p className="broadcast-preview__meta">
                {previewScope} · Shown for {form.expires_in_days} days
              </p>
            </div>
          </section>
        </div>

        <div className="broadcast-form__footer">
          {!valid ? (
            <p className="broadcast-missing-hints">
              Required before publishing: {missingFields.join(", ")}.
            </p>
          ) : (
            <p className="broadcast-missing-hints">Ready to publish to farmer phones.</p>
          )}
          <div className="broadcast-form__buttons">
            <Button type="button" variant="secondary" disabled={pending} onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !valid}>
              {pending ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
