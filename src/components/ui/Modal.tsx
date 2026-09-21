import React, { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { confirmDiscardUnsavedChanges } from "./confirmDiscard";

export interface ModalProps {
  id?: string;
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  isDirty?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Modal({
  id,
  title,
  description,
  open,
  onClose,
  children,
  footer,
  initialFocusRef,
  isDirty = false,
  disabled = false,
  className = "",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = id ? `${id}-title` : "modal-title";
  const descriptionId = id ? `${id}-description` : "modal-description";

  const handleClose = useCallback(() => {
    if (disabled) return;
    if (!confirmDiscardUnsavedChanges(isDirty)) return;
    onClose();
  }, [disabled, isDirty, onClose]);

  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex=\"-1\"])",
    ].join(",");

    const fieldSelector = [
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
    ].join(",");

    // Lock page scroll while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Immediate focus placement for jsdom and browsers (first field if present)
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (panel) {
      const firstField = panel.querySelector<HTMLElement>(fieldSelector);
      if (firstField) {
        firstField.focus();
      } else {
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(focusableSelector),
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          panel.focus();
        }
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previouslyFocusedRef.current?.isConnected) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <div className={`modal-overlay ${className}`.trim()}>
      <button
        className="modal-backdrop"
        type="button"
        aria-label="Close dialog"
        disabled={disabled}
        onClick={handleClose}
      />
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="modal-description">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close"
            disabled={disabled}
            onClick={handleClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
