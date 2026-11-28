import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { MoveHorizontal, Undo2, Upload } from "lucide-react";
import { ApiError } from "../../api/ApiError";
import type { AerialAnalysis, DiseaseReport } from "../../domain/report.types";
import {
  useAddAerialAnalysis,
  useAerialMask,
  useRemoveAerialAnalysis,
  useRestoreAerialAnalysis,
} from "../../hooks/useReports";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatAreaHectares, formatDateTime, formatMeasuredArea, formatMeasuredPercent } from "../../lib/formatters";
import { isAffectedAreaMeasured, percentAffected } from "../boundaries/fieldMapStatus";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;
const fileHint = "Use a JPG, PNG or WebP under 20 MB.";

type Highlights = "off" | "abnormal" | "both";

type UndoTarget = { analysis: AerialAnalysis; removalId: string; removalSeq: number };
type UndoState = { target: UndoTarget; notice: "failed" | "stale" | null };
type DecodedMask = { width: number; height: number; classes: Uint8Array };

function errorMessage(error: unknown): string {
  const status = error instanceof ApiError ? error.status : undefined;
  const code = error instanceof ApiError ? error.code : undefined;
  if (status === 422) return fileHint;
  if (status === 423) {
    return "This case is being reviewed by another reviewer. Refresh or wait until they finish.";
  }
  if (status === 429) {
    if (code === "AERIAL_BUSY") {
      return "Another photo is being checked right now. Wait a few seconds and retry.";
    }
    return "Upload limit reached (6 per minute). Wait a minute before trying again.";
  }
  return "We could not confirm the photo was added. Refresh the case and check before adding it again.";
}

function tokenRgb(name: string): [number, number, number] | null {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const swatch = document.createElement("canvas").getContext("2d");
  if (!swatch || !value) return null;
  swatch.fillStyle = value;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** Re-render when the app theme or system colour scheme changes. */
function useThemeVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((current) => current + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", bump);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", bump);
    };
  }, []);
  return version;
}

/**
 * Decodes the server's 8-bit class mask once per Blob (closing the ImageBitmap
 * immediately to prevent GPU memory leaks) and repaints fast when toggling
 * highlight modes or themes using flat --kpi-band-* solids.
 */
function MaskOverlay({
  mask,
  highlights,
  onDecodeError,
}: {
  mask: Blob;
  highlights: Highlights;
  onDecodeError: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [decoded, setDecoded] = useState<DecodedMask | null>(null);
  const theme = useThemeVersion();

  useEffect(() => {
    if (typeof createImageBitmap !== "function") return;
    let cancelled = false;
    void createImageBitmap(mask)
      .then((bitmap) => {
        try {
          if (cancelled) return;
          const scratch = document.createElement("canvas");
          scratch.width = bitmap.width;
          scratch.height = bitmap.height;
          const ctx = scratch.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(bitmap, 0, 0);
          const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
          const classes = new Uint8Array(bitmap.width * bitmap.height);
          for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
            classes[p] = rgba[i];
          }
          setDecoded({ width: bitmap.width, height: bitmap.height, classes });
        } finally {
          bitmap.close?.();
        }
      })
      .catch(() => {
        if (!cancelled) onDecodeError();
      });
    return () => {
      cancelled = true;
    };
  }, [mask, onDecodeError]);

  useEffect(() => {
    const target = canvas.current;
    const context = target?.getContext("2d");
    if (!target || !context || !decoded) return;
    target.width = decoded.width;
    target.height = decoded.height;
    context.clearRect(0, 0, decoded.width, decoded.height);
    if (highlights === "off") return;

    const normal = tokenRgb("--kpi-band-2");
    const abnormal = tokenRgb("--kpi-band-3");
    const output = context.createImageData(decoded.width, decoded.height);
    const data = output.data;
    const classes = decoded.classes;
    for (let p = 0, i = 0; p < classes.length; p += 1, i += 4) {
      const klass = classes[p];
      const color = klass === 2 ? abnormal : klass === 1 && highlights === "both" ? normal : null;
      if (color) {
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = 155;
      } else {
        data[i + 3] = 0;
      }
    }
    context.putImageData(output, 0, 0);
  }, [decoded, highlights, theme]);

  return <canvas ref={canvas} className="aerial-check__overlay" aria-hidden="true" />;
}

function AerialResult({
  analysis,
  isLatest,
  locked,
  onRemove,
  removing,
}: {
  analysis: AerialAnalysis;
  isLatest: boolean;
  locked: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const [highlights, setHighlights] = useState<Highlights>("abnormal");
  const [reveal, setReveal] = useState(100);
  const [photoError, setPhotoError] = useState(false);
  const [photoRetry, setPhotoRetry] = useState(0);
  const [maskDecodeError, setMaskDecodeError] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const mask = useAerialMask(analysis.maskUrl);
  const abnormal = analysis.abnormalCanopyPercent;
  const normal = analysis.normalCanopyPercent;
  const highlightsOff = highlights === "off";
  const showCurtain = !highlightsOff && Boolean(mask.data) && !maskDecodeError;

  const updateRevealFromClientX = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const next = Math.round(((clientX - rect.left) / rect.width) * 100);
    setReveal(Math.max(0, Math.min(100, next)));
  };

  const handleStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!showCurtain) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateRevealFromClientX(event.clientX);
  };

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!showCurtain || event.buttons === 0) return;
    updateRevealFromClientX(event.clientX);
  };

  return (
    <div className="aerial-check__result">
      <div className="aerial-check__stage">
        <div
          ref={frameRef}
          className={`aerial-check__frame ${showCurtain ? "aerial-check__frame--interactive" : ""}`}
          style={{
            aspectRatio: `${analysis.imageWidth} / ${analysis.imageHeight}`,
            width: `min(100%, calc(28rem * ${analysis.imageWidth / analysis.imageHeight}))`,
          }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
        >
          {photoError ? (
            <div className="aerial-check__photo-error" role="alert">
              <p>Aerial photo could not be loaded.</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPhotoError(false);
                  setPhotoRetry((count) => count + 1);
                }}
              >
                Retry photo
              </Button>
            </div>
          ) : (
            <img
              key={photoRetry}
              src={analysis.imageUrl}
              alt="Aerial photo"
              className="aerial-check__photo"
              onError={() => setPhotoError(true)}
            />
          )}
          {mask.data && !photoError && !maskDecodeError ? (
            <div
              className="aerial-check__reveal"
              style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
            >
              <MaskOverlay
                mask={mask.data}
                highlights={highlights}
                onDecodeError={() => setMaskDecodeError(true)}
              />
            </div>
          ) : null}
          {showCurtain ? (
            <>
              <div
                className="aerial-check__divider"
                style={{ left: `${reveal}%` }}
                aria-hidden="true"
              />
              <span
                className="aerial-check__handle"
                style={{ left: `${reveal}%` }}
                aria-hidden="true"
              >
                <MoveHorizontal size={16} />
              </span>
            </>
          ) : null}
          {mask.isPending && !highlightsOff ? (
            <p className="aerial-check__stage-status" role="status">
              Loading highlights…
            </p>
          ) : null}
        </div>
      </div>

      {mask.isError || maskDecodeError ? (
        <p className="form-error" role="alert">Highlights could not be loaded.</p>
      ) : null}

      <div className="aerial-check__controls">
        <fieldset className="aerial-check__switch">
          <legend>Highlights</legend>
          {(["off", "abnormal", "both"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name={`highlights-${analysis.uuid}`}
                checked={highlights === value}
                onChange={() => setHighlights(value)}
              />
              <span>
                {value === "off"
                  ? "Photo only"
                  : value === "abnormal"
                    ? "Problem areas"
                    : "Problem and healthy"}
              </span>
            </label>
          ))}
        </fieldset>
        <label className={`aerial-check__compare ${highlightsOff ? "is-disabled" : ""}`}>
          <span>Photo</span>
          <input
            type="range"
            min={0}
            max={100}
            value={reveal}
            disabled={highlightsOff}
            onChange={(event) => setReveal(Number(event.currentTarget.value))}
            aria-label="Highlight reveal"
          />
          <span>{highlights === "both" ? "Problem and healthy" : "Problem areas"}</span>
        </label>
      </div>

      {analysis.enoughCanopy && abnormal !== null && normal !== null ? (
        <>
          <p className="aerial-check__headline">
            <strong>{Math.round(abnormal)}%</strong> of the visible cane looks abnormal
          </p>
          <div
            className="aerial-check__bar"
            role="img"
            aria-label={`Normal ${Math.round(normal)}%, abnormal ${Math.round(abnormal)}%`}
          >
            <span className="kpi-band-fill--2" style={{ width: `${normal}%` }} />
            <span className="kpi-band-fill--3" style={{ width: `${abnormal}%` }} />
          </div>
          <p className="aerial-check__legend">
            <span><i className="kpi-band-fill--2" />Normal {Math.round(normal)}%</span>
            <span><i className="kpi-band-fill--3" />Abnormal {Math.round(abnormal)}%</span>
          </p>
        </>
      ) : (
        <p className="aerial-check__headline">Not enough cane visible to estimate</p>
      )}
      <p className="aerial-check__coverage">
        Cane visible in photo: {Math.round(analysis.canopyCoveragePercent)}%
      </p>

      <p className="aerial-check__meta">
        {isLatest ? <span className="aerial-check__tag">Latest</span> : <span className="aerial-check__tag">Earlier check</span>}
        <span>{analysis.uploadedBy.name}</span>
        <time dateTime={analysis.createdAt}>{formatDateTime(analysis.createdAt)}</time>
        <span>{analysis.modelVersion}</span>
        <span>{analysis.imageWidth} × {analysis.imageHeight} px</span>
        <Button type="button" variant="quiet" onClick={onRemove} disabled={removing || locked}>
          Remove
        </Button>
      </p>
    </div>
  );
}

/** Ground (GPS polygon) and photo figures sit side by side and are never combined. */
function GroundVersusPhoto({ report, analysis }: { report: DiseaseReport; analysis?: AerialAnalysis }) {
  const boundaries = report.affectedFields ?? [];

  return (
    <div className="aerial-check__strip">
      <section aria-labelledby="aerial-ground-heading">
        <h3 id="aerial-ground-heading">Measured on the ground</h3>
        <p className="aerial-check__badge">Phone GPS · office</p>
        {boundaries.length > 0 ? (
          <ul>
            {boundaries.map((field) => {
              const plotLabel = formatAreaHectares(field.areaSqm / 10_000);
              const measured = isAffectedAreaMeasured(field.affectedAreaSqm, field.affectedAreaMeasurement);
              const pct = measured
                ? (field.affectedPercent ?? percentAffected(field.areaSqm, field.affectedAreaSqm, field.affectedAreaMeasurement))
                : null;
              const positiveArea = (field.affectedAreaSqm ?? 0) > 0;
              const groundDetail = measured
                ? `${formatMeasuredArea(field.affectedAreaSqm! / 10_000, "measured")} affected${pct === null ? "" : ` · ${formatMeasuredPercent(pct, "measured", { positiveArea })} affected`}`
                : field.affectedAreaMeasurement === "not_measured"
                  ? "Not measured"
                  : field.affectedPercent !== null && field.affectedPercent > 0
                    ? `${formatMeasuredPercent(field.affectedPercent, "measured", { positiveArea })} affected`
                    : "Not measured";
              return (
                <li key={field.fieldSurveyId}>
                  Boundary {field.fieldSurveyId}: {plotLabel} · {groundDetail}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No linked boundary</p>
        )}
      </section>
      <section aria-labelledby="aerial-photo-heading">
        <h3 id="aerial-photo-heading">Seen in this photo</h3>
        <p className="aerial-check__badge">Aerial image estimate · experimental</p>
        {analysis?.enoughCanopy && analysis.abnormalCanopyPercent !== null ? (
          <p>{Math.round(analysis.abnormalCanopyPercent)}% of visible cane</p>
        ) : (
          <p>No estimate</p>
        )}
      </section>
    </div>
  );
}

export function AerialCheckCard({
  report,
  locked = false,
}: {
  report: DiseaseReport;
  locked?: boolean;
}) {
  const online = useOnlineStatus();
  const add = useAddAerialAnalysis(report.uuid);
  const remove = useRemoveAerialAnalysis(report.uuid);
  const restore = useRestoreAerialAnalysis(report.uuid);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const nextOperation = useRef(0);
  const lastUploadSeq = useRef(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const analyses = report.aerialAnalyses ?? [];
  const [latest, ...earlier] = analyses;
  const activeAnalysis =
    (selectedUuid ? analyses.find((item) => item.uuid === selectedUuid) : null) ?? latest;
  const uploadDisabled = !online || add.isPending || locked;

  const submit = (file: File) => {
    if (locked) return;
    setLastFile(file);
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setProblem(fileHint);
      return;
    }
    setProblem(null);
    const uploadSeq = ++nextOperation.current;
    add.mutate(file, {
      onSuccess: (created) => {
        setLastFile(null);
        setSelectedUuid(created?.uuid ?? null);
        lastUploadSeq.current = Math.max(lastUploadSeq.current, uploadSeq);
        setUndo((current) => (current && current.target.removalSeq < uploadSeq ? null : current));
      },
      onError: (error) => {
        if (!(error instanceof ApiError && error.status === 429)) setLastFile(null);
        setProblem(errorMessage(error));
      },
    });
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!uploadDisabled) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (uploadDisabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) submit(file);
  };

  const [pendingRemoval, setPendingRemoval] = useState<AerialAnalysis | null>(null);
  const confirmRemove = (analysis: AerialAnalysis) => {
    if (!locked) setPendingRemoval(analysis);
  };
  const closeRemoval = () => setPendingRemoval(null);
  const removeConfirmed = (analysis: AerialAnalysis) => {
    const removalSeq = ++nextOperation.current;
    remove.mutate(analysis.uuid, {
      onSuccess: (removal) => {
        if (selectedUuid === analysis.uuid) setSelectedUuid(null);
        if (removalSeq < lastUploadSeq.current) return;
        setUndo({ target: { analysis, removalId: removal.removalId, removalSeq }, notice: null });
      },
    });
  };
  const undoRemoval = (target: UndoTarget) =>
    restore.mutate(
      { analysisUuid: target.analysis.uuid, removalId: target.removalId },
      {
        onSuccess: () => setUndo((current) => (current?.target === target ? null : current)),
        onError: (error) => {
          const notice = error instanceof ApiError && error.status === 409 ? "stale" : "failed";
          setUndo((current) => (current?.target === target ? { target, notice } : current));
        },
      },
    );

  return (
    <section className="review-card aerial-check" aria-labelledby="aerial-check-heading">
      <div className="section-heading">
        <h2 id="aerial-check-heading">Aerial check</h2>
      </div>
      <p className="aerial-check__provenance">
        Supporting evidence from one aerial photo. Experimental; not a ground measurement.
      </p>

      {locked ? (
        <p className="aerial-check__locked" role="status">
          Read-only while another reviewer holds this case. Existing checks stay viewable.
        </p>
      ) : (
        <label
          className={`aerial-check__drop ${isDragging ? "is-dragging" : ""}`}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="aerial-check__drop-title">
            <Upload aria-hidden="true" size={18} />
            <span>{latest ? "Add another aerial photo" : "Add aerial photo"}</span>
          </span>
          <small>Drop a JPG, PNG or WebP here, or choose a file (up to 20 MB)</small>
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            disabled={uploadDisabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) submit(file);
            }}
          />
        </label>
      )}
      {!online ? <p className="aerial-check__offline" role="status">Offline. Reconnect to add a photo.</p> : null}
      {add.isPending ? (
        <p role="status" aria-busy="true">
          Checking the photo…{lastFile ? ` (${lastFile.name})` : ""}
        </p>
      ) : null}
      {problem ? (
        <p className="form-error" role="alert">
          {problem}
          {lastFile && problem !== fileHint ? (
            <>
              {" "}
              <Button type="button" variant="secondary" onClick={() => submit(lastFile)} disabled={!online || locked}>
                Retry
              </Button>
            </>
          ) : null}
        </p>
      ) : null}

      {activeAnalysis ? (
        <AerialResult
          key={activeAnalysis.uuid}
          analysis={activeAnalysis}
          isLatest={activeAnalysis.uuid === latest?.uuid}
          locked={locked}
          removing={remove.isPending}
          onRemove={() => confirmRemove(activeAnalysis)}
        />
      ) : null}
      {remove.isError ? <p className="form-error" role="alert">Could not remove the check. Try again.</p> : null}
      {undo && undo.notice !== "stale" ? (
        <p className="aerial-check__undo" role="status">
          Check removed.{" "}
          <Button
            type="button"
            variant="secondary"
            icon={<Undo2 aria-hidden="true" size={16} />}
            onClick={() => undoRemoval(undo.target)}
            disabled={restore.isPending || locked}
          >
            Undo
          </Button>
        </p>
      ) : null}
      {undo?.notice === "failed" ? <p className="form-error" role="alert">Could not undo. Try again.</p> : null}
      {undo?.notice === "stale" ? (
        <p className="form-error" role="alert">
          This check was changed by someone else. Refresh the case before undoing.
        </p>
      ) : null}

      <Modal
        id="aerial-remove"
        title="Remove this aerial check?"
        description="The photo and its result are removed from the case. You can undo the removal right after."
        open={pendingRemoval !== null}
        onClose={closeRemoval}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeRemoval}>
              Keep it
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingRemoval) removeConfirmed(pendingRemoval);
                closeRemoval();
              }}
            >
              Remove check
            </Button>
          </>
        }
      >
        {pendingRemoval ? <p>Added {formatDateTime(pendingRemoval.createdAt)}</p> : null}
      </Modal>

      <GroundVersusPhoto report={report} analysis={activeAnalysis} />

      {earlier.length > 0 ? (
        <section className="aerial-check__earlier" aria-labelledby="aerial-earlier-heading">
          <h3 id="aerial-earlier-heading">Earlier aerial checks ({earlier.length})</h3>
          {activeAnalysis && activeAnalysis.uuid !== latest.uuid ? (
            <p className="aerial-check__viewing-note">
              Viewing an earlier check.{" "}
              <button
                type="button"
                className="table-action"
                onClick={() => setSelectedUuid(latest.uuid)}
              >
                Back to latest
              </button>
            </p>
          ) : null}
          <ul>
            {earlier.map((analysis) => {
              const selected = activeAnalysis?.uuid === analysis.uuid;
              return (
                <li key={analysis.uuid} className={selected ? "is-selected" : undefined}>
                  <button
                    type="button"
                    className="aerial-check__earlier-select"
                    aria-pressed={selected}
                    onClick={() => setSelectedUuid(analysis.uuid)}
                  >
                    <time dateTime={analysis.createdAt}>{formatDateTime(analysis.createdAt)}</time>
                    <span>
                      {analysis.enoughCanopy && analysis.abnormalCanopyPercent !== null
                        ? ` · ${Math.round(analysis.abnormalCanopyPercent)}% of visible cane abnormal`
                        : " · Not enough cane visible"}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => confirmRemove(analysis)}
                    disabled={remove.isPending || locked}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
