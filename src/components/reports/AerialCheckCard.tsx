import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/ApiError";
import type { AerialAnalysis, DiseaseReport } from "../../domain/report.types";
import {
  useAddAerialAnalysis,
  useAerialMask,
  useRemoveAerialAnalysis,
} from "../../hooks/useReports";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;
const fileHint = "Use a JPG, PNG or WebP under 20 MB.";

type Highlights = "off" | "abnormal" | "both";

function errorMessage(error: unknown): string {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 422) return fileHint;
  if (status === 429) return "Another photo is being checked. Try again in a moment.";
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

/** Paints the server's class mask (0 background, 1 normal, 2 abnormal) with the band solids. */
function MaskOverlay({ mask, highlights }: { mask: Blob; highlights: Highlights }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useThemeVersion();

  useEffect(() => {
    const target = canvas.current;
    const context = target?.getContext("2d");
    if (!target || !context || typeof createImageBitmap !== "function") return;
    let cancelled = false;
    void createImageBitmap(mask).then((bitmap) => {
      if (cancelled) return;
      target.width = bitmap.width;
      target.height = bitmap.height;
      context.clearRect(0, 0, bitmap.width, bitmap.height);
      if (highlights === "off") return;
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const normal = tokenRgb("--kpi-band-2");
      const abnormal = tokenRgb("--kpi-band-3");
      const data = pixels.data;
      for (let index = 0; index < data.length; index += 4) {
        const klass = data[index];
        const color = klass === 2 ? abnormal : klass === 1 && highlights === "both" ? normal : null;
        if (color) {
          data[index] = color[0];
          data[index + 1] = color[1];
          data[index + 2] = color[2];
          data[index + 3] = 150;
        } else {
          data[index + 3] = 0;
        }
      }
      context.putImageData(pixels, 0, 0);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mask, highlights, theme]);

  return <canvas ref={canvas} className="aerial-check__overlay" aria-hidden="true" />;
}

function AerialResult({
  analysis,
  onRemove,
  removing,
}: {
  analysis: AerialAnalysis;
  onRemove: () => void;
  removing: boolean;
}) {
  const [highlights, setHighlights] = useState<Highlights>("abnormal");
  const [reveal, setReveal] = useState(100);
  const mask = useAerialMask(analysis.maskUrl);
  const abnormal = analysis.abnormalCanopyPercent;
  const normal = analysis.normalCanopyPercent;

  return (
    <div className="aerial-check__result">
      <div
        className="aerial-check__stage"
        style={{ aspectRatio: `${analysis.imageWidth} / ${analysis.imageHeight}` }}
      >
        <img src={analysis.imageUrl} alt="Aerial photo" className="aerial-check__photo" />
        {mask.data ? (
          <div className="aerial-check__reveal" style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
            <MaskOverlay mask={mask.data} highlights={highlights} />
          </div>
        ) : null}
      </div>
      {mask.isError ? <p className="form-error" role="alert">Highlights could not be loaded.</p> : null}

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
              <span>{value === "off" ? "Photo only" : value === "abnormal" ? "Problem areas" : "Problem and healthy"}</span>
            </label>
          ))}
        </fieldset>
        <label className="aerial-check__compare">
          <span>Photo</span>
          <input
            type="range"
            min={0}
            max={100}
            value={reveal}
            onChange={(event) => setReveal(Number(event.currentTarget.value))}
            aria-label="Compare: photo on the left, problem areas on the right"
          />
          <span>Problem areas</span>
        </label>
      </div>

      {analysis.enoughCanopy && abnormal !== null && normal !== null ? (
        <>
          <p className="aerial-check__headline">
            <strong>{Math.round(abnormal)}%</strong> of the visible cane looks abnormal
          </p>
          <div className="aerial-check__bar" role="img" aria-label={`Normal ${Math.round(normal)}%, abnormal ${Math.round(abnormal)}%`}>
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
      <p className="aerial-check__coverage">Cane visible in photo: {Math.round(analysis.canopyCoveragePercent)}%</p>

      <p className="aerial-check__meta">
        <span>{analysis.uploadedBy.name}</span>
        <time dateTime={analysis.createdAt}>{formatDateTime(analysis.createdAt)}</time>
        <details className="aerial-check__details">
          <summary>Details</summary>
          <span>Model {analysis.modelVersion}</span>
        </details>
        <Button type="button" variant="quiet" onClick={onRemove} disabled={removing}>
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
            {boundaries.map((field) => (
              <li key={field.fieldSurveyId}>
                Boundary {field.fieldSurveyId}: {(field.areaSqm / 10000).toFixed(2)} ha · loss {field.lossRatePercent}%
              </li>
            ))}
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

export function AerialCheckCard({ report }: { report: DiseaseReport }) {
  const online = useOnlineStatus();
  const add = useAddAerialAnalysis(report.uuid);
  const remove = useRemoveAerialAnalysis(report.uuid);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const analyses = report.aerialAnalyses ?? [];
  const [latest, ...earlier] = analyses;

  const submit = (file: File) => {
    setLastFile(file);
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setProblem(fileHint);
      return;
    }
    setProblem(null);
    add.mutate(file, {
      onSuccess: () => setLastFile(null),
      onError: (error) => {
        if (!(error instanceof ApiError && error.status === 429)) setLastFile(null);
        setProblem(errorMessage(error));
      },
    });
  };

  const [pendingRemoval, setPendingRemoval] = useState<AerialAnalysis | null>(null);
  const confirmRemove = (analysis: AerialAnalysis) => setPendingRemoval(analysis);
  const closeRemoval = () => setPendingRemoval(null);

  return (
    <section className="review-card aerial-check" aria-labelledby="aerial-check-heading">
      <div className="section-heading">
        <h2 id="aerial-check-heading">Aerial check</h2>
      </div>
      <p className="aerial-check__provenance">
        Supporting evidence from one aerial photo. Experimental; not a ground measurement.
      </p>

      <label
        className="aerial-check__drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file && online && !add.isPending) submit(file);
        }}
      >
        <span>{latest ? "Add another aerial photo" : "Add aerial photo"}</span>
        <small>Drop a photo here or choose one. JPG, PNG or WebP, up to 20 MB</small>
        <input
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          disabled={!online || add.isPending}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) submit(file);
          }}
        />
      </label>
      {!online ? <p className="aerial-check__offline" role="status">Offline. Reconnect to add a photo.</p> : null}
      {add.isPending ? <p role="status" aria-busy="true">Checking the photo…</p> : null}
      {problem ? (
        <p className="form-error" role="alert">
          {problem}
          {lastFile && problem !== fileHint ? (
            <>
              {" "}
              <Button type="button" variant="secondary" onClick={() => submit(lastFile)} disabled={!online}>
                Retry
              </Button>
            </>
          ) : null}
        </p>
      ) : null}

      {latest ? (
        <AerialResult
          key={latest.uuid}
          analysis={latest}
          removing={remove.isPending}
          onRemove={() => confirmRemove(latest)}
        />
      ) : null}
      {remove.isError ? <p className="form-error" role="alert">Could not remove the check. Try again.</p> : null}

      <Modal
        id="aerial-remove"
        title="Remove this aerial check?"
        description="The photo and its result are removed from the case. You can add the photo again later."
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
                if (pendingRemoval) remove.mutate(pendingRemoval.uuid);
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

      <GroundVersusPhoto report={report} analysis={latest} />

      {earlier.length > 0 ? (
        <details className="aerial-check__earlier">
          <summary>Earlier aerial checks ({earlier.length})</summary>
          <ul>
            {earlier.map((analysis) => (
              <li key={analysis.uuid}>
                <time dateTime={analysis.createdAt}>{formatDateTime(analysis.createdAt)}</time>
                <span>
                  {analysis.enoughCanopy && analysis.abnormalCanopyPercent !== null
                    ? ` · ${Math.round(analysis.abnormalCanopyPercent)}% of visible cane abnormal`
                    : " · Not enough cane visible"}
                </span>
                <Button type="button" variant="quiet" onClick={() => confirmRemove(analysis)} disabled={remove.isPending}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
