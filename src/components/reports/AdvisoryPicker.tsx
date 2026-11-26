import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { ApiError } from "../../api/ApiError";
import { advisoryCategories, advisoryCategoryLabels, advisoryCategoryShortLabels } from "../../domain/report.metadata";
import type { Advisory, AdvisoryCategory } from "../../domain/report.types";
import { useCreateAdvisory, useDeleteAdvisory, useUpdateAdvisory } from "../../hooks/useReports";
import { Button } from "../ui/Button";
import { SearchInput, SelectFilter, TextArea } from "../ui/FormControls";
import { Modal } from "../ui/Modal";
import { filterAdvisories, findSimilarAdvisory, type AdvisoryTopicFilter } from "./advisoryLibrary";

type EditorMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; uuid: string };

interface AdvisoryPickerProps {
  /** Validated advisories only: drafts and retired ones cannot be sent. */
  advisories: Advisory[];
  value: string;
  onChange: (uuid: string) => void;
  loading?: boolean;
  loadFailed?: boolean;
  /** Re-reads the library; used for the load retry and after another reviewer removed an advisory. */
  onRefresh: () => unknown;
  disabled?: boolean;
  /** The required-selection error is rendered by the form; this only wires it to the group. */
  invalid?: boolean;
  describedBy?: string;
  /** The server refused the selected advisory because it left the office library. */
  unavailableMessage?: string | null;
}

function topicLabel(category: Advisory["category"]) {
  return category ? advisoryCategoryShortLabels[category] : null;
}

function metaLine(advisory: Advisory) {
  return [advisory.code, topicLabel(advisory.category)].filter(Boolean).join(" · ");
}

function savingFailed(error: unknown): { fields: Record<string, string[]>; message: string | null } {
  if (error instanceof ApiError && error.status === 422 && error.errors) {
    const { status, ...fields } = error.errors;
    return { fields, message: status?.[0] ?? (Object.keys(fields).length ? null : error.message) };
  }
  if (error instanceof ApiError && error.status === 403) {
    return { fields: {}, message: "Your account can't change the advisory library." };
  }
  return { fields: {}, message: "The advisory could not be saved. Check the connection and try again." };
}

/**
 * Shared office advisory library inside the case decision: browse, preview and
 * pick an advisory to send, or add, reword and remove advisories without leaving the case.
 * Wording already sent stays on its case; edits and deletes only shape future sends.
 */
export function AdvisoryPicker({
  advisories,
  value,
  onChange,
  loading = false,
  loadFailed = false,
  onRefresh,
  disabled = false,
  invalid = false,
  describedBy,
  unavailableMessage = null,
}: AdvisoryPickerProps) {
  const groupName = useId();
  const labelId = useId();
  const editorHeadingId = useId();
  const titleId = useId();
  const titleErrorId = useId();
  const codeId = useId();
  const codeErrorId = useId();
  const contentId = useId();
  const contentErrorId = useId();
  const createAdvisory = useCreateAdvisory();
  const updateAdvisory = useUpdateAdvisory();
  const deleteAdvisory = useDeleteAdvisory();

  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState<AdvisoryTopicFilter>("all");
  const [mode, setMode] = useState<EditorMode>({ kind: "closed" });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<AdvisoryCategory | "">("general");
  const [code, setCode] = useState("");
  const [content, setContent] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Advisory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const newRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<"new" | "edit">("new");
  const wasOpen = useRef(false);

  const selected = advisories.find((item) => item.uuid === value);
  const editing = mode.kind === "edit" ? advisories.find((item) => item.uuid === mode.uuid) : undefined;
  const open = mode.kind !== "closed";
  const topics = useMemo(
    () => advisoryCategories.filter((entry) => advisories.some((item) => item.category === entry)),
    [advisories],
  );
  const similar = open ? findSimilarAdvisory(title, advisories, editing?.uuid) : undefined;
  const editingWithoutTopic = mode.kind === "edit" && editing && !editing.category;

  // Selecting a topic that no longer exists (its last advisory was removed) would show an empty list.
  const activeTopic = topic === "all" || topics.includes(topic) ? topic : "all";
  const visible = useMemo(() => filterAdvisories(advisories, search, activeTopic), [advisories, search, activeTopic]);

  useEffect(() => {
    if (open) {
      titleRef.current?.focus();
    } else if (wasOpen.current) {
      (returnFocusTo.current === "edit" ? editRef.current : newRef.current)?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const resetEditor = (next: EditorMode, source?: Advisory) => {
    setMode(next);
    setTitle(source?.title ?? "");
    setCategory(source ? source.category ?? "" : "general");
    setCode(source?.code ?? "");
    setContent(source?.content ?? "");
    setAttempted(false);
    setServerErrors({});
    setFormMessage(null);
  };

  const startCreate = () => {
    returnFocusTo.current = "new";
    setNotice("");
    resetEditor({ kind: "create" });
  };
  const startEdit = (advisory: Advisory) => {
    returnFocusTo.current = "edit";
    setNotice("");
    resetEditor({ kind: "edit", uuid: advisory.uuid }, advisory);
  };
  const cancelEditor = () => resetEditor({ kind: "closed" });

  const choose = (uuid: string) => {
    setNotice("");
    onChange(uuid);
  };

  const save = async () => {
    if (saving) return;
    setAttempted(true);
    setServerErrors({});
    setFormMessage(null);
    if (!title.trim() || !content.trim()) {
      (title.trim() ? document.getElementById(contentId) : titleRef.current)?.focus();
      return;
    }
    setSaving(true);
    try {
      if (mode.kind === "edit") {
        await updateAdvisory.mutateAsync({
          advisoryUuid: mode.uuid,
          changes: { title, content, category: category || null, code },
        });
        setNotice("Advisory updated. Past cases keep their wording.");
      } else {
        const created = await createAdvisory.mutateAsync({
          title,
          content,
          ...(category ? { category } : {}),
          code,
        });
        onChange(created.uuid);
        setNotice("Advisory added and selected.");
      }
      resetEditor({ kind: "closed" });
    } catch (error) {
      const failure = savingFailed(error);
      setServerErrors(failure.fields);
      setFormMessage(failure.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteAdvisory.mutateAsync(deleteTarget.uuid);
      if (deleteTarget.uuid === value) onChange("");
      setNotice(result.deleted === "archived"
        ? "Advisory archived. Past cases keep their wording."
        : "Advisory removed.");
      setDeleteTarget(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // Someone else already removed it: reconcile with the library instead of failing.
        if (deleteTarget.uuid === value) onChange("");
        setNotice("Advisory was already removed.");
        setDeleteTarget(null);
        void onRefresh();
      } else {
        setDeleteError(error instanceof ApiError && error.status === 403
          ? "Your account can't change the advisory library."
          : "The advisory could not be deleted. Try again.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  // After a delete the invoking button is gone; send focus to the library's search or first control.
  const deletedFocus = useRef(false);
  useEffect(() => {
    if (deleteTarget) {
      deletedFocus.current = true;
    } else if (deletedFocus.current) {
      deletedFocus.current = false;
      if (!editRef.current?.isConnected) newRef.current?.focus();
    }
  }, [deleteTarget]);

  const onEditorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && open && !deleteTarget) {
      event.preventDefault();
      event.stopPropagation();
      cancelEditor();
    }
  };
  const onFieldEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    // The picker lives inside the review form; Enter saves the advisory, never the review.
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };

  const titleMissing = attempted && !title.trim();
  const contentMissing = attempted && !content.trim();
  const titleError = titleMissing ? "Add a title." : serverErrors.title?.[0];
  const codeError = serverErrors.code?.[0];
  const contentError = contentMissing ? "Add the guidance to send." : serverErrors.content?.[0];
  const categoryError = serverErrors.category?.[0];
  const empty = !loading && !loadFailed && advisories.length === 0;

  const editor = open ? (
    <div className="advisory-editor" role="group" aria-labelledby={editorHeadingId} onKeyDown={onEditorKeyDown}>
      <h3 id={editorHeadingId}>{mode.kind === "edit" ? "Edit advisory" : "New advisory"}</h3>
      {mode.kind === "edit" ? <p className="advisory-editor__note">Changes apply to future sends only. Past cases keep their wording.</p> : null}
      <div className="advisory-editor__fields">
        <div className="advisory-editor__cell advisory-editor__cell--wide">
          <label className="advisory-field" htmlFor={titleId}>
            <span>Title</span>
            <input ref={titleRef} id={titleId} type="text" value={title} maxLength={160} disabled={saving}
              aria-invalid={Boolean(titleError)} aria-describedby={titleError ? titleErrorId : undefined}
              onChange={(event) => setTitle(event.target.value)} onKeyDown={onFieldEnter} />
          </label>
          {titleError ? <p id={titleErrorId} className="advisory-field__error" role="alert">{titleError}</p> : null}
        </div>
        <div className="advisory-editor__cell">
          <SelectFilter label="Topic" value={category} disabled={saving} aria-invalid={Boolean(categoryError)}
            onChange={(event) => setCategory(event.target.value as AdvisoryCategory | "")}>
            {editingWithoutTopic ? <option value="">No topic</option> : null}
            {advisoryCategories.map((entry) => <option key={entry} value={entry}>{advisoryCategoryLabels[entry]}</option>)}
          </SelectFilter>
          {categoryError ? <p className="advisory-field__error" role="alert">{categoryError}</p> : null}
        </div>
        <div className="advisory-editor__cell">
          <label className="advisory-field" htmlFor={codeId}>
            <span>Code (auto if blank)</span>
            <input id={codeId} type="text" value={code} maxLength={64} disabled={saving}
              aria-invalid={Boolean(codeError)} aria-describedby={codeError ? codeErrorId : undefined}
              onChange={(event) => setCode(event.target.value)} onKeyDown={onFieldEnter} />
          </label>
          {codeError ? <p id={codeErrorId} className="advisory-field__error" role="alert">{codeError}</p> : null}
        </div>
      </div>
      {similar ? <div className="advisory-editor__similar" role="status">
        <span>A similar advisory already exists: <strong>{similar.title}</strong> <small>{similar.code}</small></span>
        <Button type="button" variant="secondary" disabled={saving} onClick={() => { choose(similar.uuid); cancelEditor(); }}>Use it instead</Button>
      </div> : null}
      <TextArea label="Guidance" id={contentId} placeholder="Steps the reporter should follow" value={content} rows={5} maxLength={10000} disabled={saving}
        aria-invalid={Boolean(contentError)} aria-describedby={contentError ? contentErrorId : undefined}
        onChange={(event) => setContent(event.target.value)} />
      {contentError ? <p id={contentErrorId} className="advisory-field__error" role="alert">{contentError}</p> : null}
      {formMessage ? <p className="advisory-field__error" role="alert">{formMessage}</p> : null}
      <div className="advisory-editor__actions">
        <Button type="button" variant="secondary" disabled={saving} onClick={cancelEditor}>Cancel</Button>
        <Button type="button" icon={<Check aria-hidden="true" size={16} />} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : mode.kind === "edit" ? "Save changes" : "Save & select"}
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="advisory-picker" data-state={loading ? "loading" : loadFailed ? "error" : empty ? "empty" : "ready"}>
      <div className="advisory-picker__head">
        <span id={labelId} className="advisory-picker__label">Advisory to send</span>
        {!open && !empty && !loading && !loadFailed ? (
          <Button ref={newRef} type="button" variant="secondary" icon={<Plus aria-hidden="true" size={16} />} disabled={disabled} onClick={startCreate}>New advisory</Button>
        ) : null}
      </div>

      {unavailableMessage ? <p className="advisory-picker__alert" role="alert">{unavailableMessage}</p> : null}
      <p className="advisory-picker__notice" role="status">{notice}</p>

      {editor}

      {loading ? <p className="advisory-picker__state" role="status">Loading advisories…</p> : null}

      {loadFailed ? <div className="advisory-picker__state advisory-picker__state--error" role="alert">
        <p>The advisory library could not be loaded.</p>
        <Button type="button" variant="secondary" onClick={() => void onRefresh()}>Retry advisories</Button>
      </div> : null}

      {empty && !open ? <div className="advisory-picker__state advisory-picker__state--empty">
        <p className="advisory-picker__empty-title">No advisories yet</p>
        <Button ref={newRef} type="button" icon={<Plus aria-hidden="true" size={16} />} disabled={disabled} onClick={startCreate}>New advisory</Button>
      </div> : null}

      {!loading && !loadFailed && advisories.length > 0 && !open ? <>
        <div className="advisory-picker__toolbar">
          <SearchInput label="Search advisories" placeholder="Search advisories" value={search} onChange={(event) => setSearch(event.target.value)} />
          {topics.length > 0 ? <div className="advisory-picker__chips" role="group" aria-label="Filter by topic">
            <button type="button" className="advisory-chip" aria-pressed={activeTopic === "all"} onClick={() => setTopic("all")}>All</button>
            {topics.map((entry) => <button key={entry} type="button" className="advisory-chip" aria-pressed={activeTopic === entry} onClick={() => setTopic(entry)}>
              {advisoryCategoryLabels[entry]}
            </button>)}
          </div> : null}
        </div>

        <div className="advisory-picker__list" role="radiogroup" aria-labelledby={labelId} aria-required="true"
          aria-invalid={invalid || undefined} aria-describedby={describedBy}>
          {visible.map((item) => <label key={item.uuid} className="advisory-option">
            <input type="radio" name={groupName} value={item.uuid} checked={item.uuid === value} disabled={disabled}
              onChange={() => choose(item.uuid)} />
            <span className="advisory-option__body">
              <strong>{item.title}</strong>
              <small>{metaLine(item)}</small>
            </span>
          </label>)}
          {visible.length === 0 ? <div className="advisory-picker__none">
            <p>No advisories match.</p>
            <Button type="button" variant="quiet" onClick={() => { setSearch(""); setTopic("all"); }}>Clear search and topic</Button>
          </div> : null}
        </div>

        {selected ? <section className="advisory-preview" aria-label="Selected advisory">
          <div className="advisory-preview__head">
            <div>
              <h3>{selected.title}</h3>
              <p className="advisory-preview__meta">{metaLine(selected)}</p>
            </div>
            <div className="advisory-preview__actions">
              <Button ref={editRef} type="button" variant="secondary" icon={<Pencil aria-hidden="true" size={16} />} disabled={disabled}
                aria-label={`Edit ${selected.title}`} onClick={() => startEdit(selected)}>Edit</Button>
              <Button type="button" variant="secondary" className="advisory-preview__delete" icon={<Trash2 aria-hidden="true" size={16} />} disabled={disabled}
                aria-label={`Delete ${selected.title}`} onClick={() => { setDeleteError(null); setDeleteTarget(selected); }}>Delete</Button>
            </div>
          </div>
          <p className="advisory-preview__content">{selected.content}</p>
        </section> : null}
      </> : null}

      <Modal id="advisory-delete" className="advisory-delete-modal" title="Delete this advisory?" open={deleteTarget !== null}
        description="It is removed if no case has sent it. If it was sent before, it is archived and past cases keep their wording."
        initialFocusRef={cancelDeleteRef} disabled={deleting} onClose={closeDelete}
        footer={<>
          <Button ref={cancelDeleteRef} type="button" variant="secondary" disabled={deleting} onClick={closeDelete}>Cancel</Button>
          <Button type="button" variant="danger" icon={<Trash2 aria-hidden="true" size={16} />} disabled={deleting} onClick={() => void confirmDelete()}>
            {deleting ? "Deleting…" : "Delete advisory"}
          </Button>
        </>}>
        {deleteTarget ? <p className="advisory-delete__name"><strong>{deleteTarget.title}</strong><small>{metaLine(deleteTarget)}</small></p> : null}
        {deleteError ? <p className="advisory-field__error" role="alert">{deleteError}</p> : null}
      </Modal>
    </div>
  );
}
