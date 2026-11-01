import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

/** Appears after 600px of scroll, and returns focus to the top of the content. */
const SHOW_AFTER_PX = 600;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible) return null;

  return (
    <button
      className="back-to-top"
      type="button"
      onClick={() => {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}
    >
      <ArrowUp aria-hidden="true" />
      <span>Back to top</span>
    </button>
  );
}
