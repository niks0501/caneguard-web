import { legacyPaths } from "./publicContent";

export function LegacyPaths() {
  return (
    <ul className="pub-legacy">
      {legacyPaths.map((path, i) => (
        <li key={path.id} className={`pub-card pub-path pub-path--${i + 1}`}>
          <h3>{path.title}</h3>
          <p>{path.text}</p>
        </li>
      ))}
    </ul>
  );
}
