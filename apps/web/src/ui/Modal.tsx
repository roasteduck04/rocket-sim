import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Optional footer row (e.g. action buttons). */
  footer?: ReactNode;
  /** Close when the backdrop is clicked. Default true. */
  dismissOnBackdrop?: boolean;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal — a portalled ARIA dialog with a focus trap. While open: focus moves
 * inside, Tab/Shift+Tab cycle within the dialog, Esc closes, and the previously
 * focused element is restored on close. Renders nothing when `open` is false.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // Focus the first focusable control, else the dialog itself.
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === firstEl || activeEl === dialog)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fd-modal__backdrop" onMouseDown={dismissOnBackdrop ? onClose : undefined}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fd-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="fd-modal__head">
          <h2 id={titleId} className="fd-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="fd-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="fd-modal__body">{children}</div>
        {footer != null && <footer className="fd-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
