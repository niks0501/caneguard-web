import { Briefcase, Eye, GraduationCap, Users, type LucideIcon } from "lucide-react";
import { legacyPaths, type LegacyPath } from "./publicContent";

const PATH_ICONS: Record<LegacyPath["id"], LucideIcon> = {
  scholarship: GraduationCap,
  "block-farm": Users,
  scout: Eye,
  career: Briefcase,
};

/** Four structured pathways into sugarcane farming, research, and district protection. */
export function LegacyPaths() {
  return (
    <ul className="pub-legacy">
      {legacyPaths.map((path, i) => {
        const Icon = PATH_ICONS[path.id];
        const step = String(i + 1).padStart(2, "0");

        return (
          <li
            key={path.id}
            className={`pub-card pub-glass--strong pub-path pub-path--${i + 1}`}
          >
            <div className="pub-path__head">
              <div className="pub-path__identity">
                <span className="pub-path__icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={2} />
                </span>
                <span className="pub-path__tag">{path.tag}</span>
              </div>
              <span className="pub-path__num" aria-hidden="true">
                {step}
              </span>
            </div>
            <div className="pub-path__body">
              <h3>{path.title}</h3>
              <p>{path.text}</p>
            </div>
            <p className="pub-path__cue">{path.cue}</p>
          </li>
        );
      })}
    </ul>
  );
}
