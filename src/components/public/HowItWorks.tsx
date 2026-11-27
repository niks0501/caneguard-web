import { flowSteps } from "./publicContent";

export function HowItWorks() {
  return (
    <ol className="pub-grid pub-grid--4 pub-flow">
      {flowSteps.map((step, i) => (
        <li key={step.id} className="pub-card">
          <span className="pub-flow__badge" aria-hidden="true">
            {i + 1}
          </span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </li>
      ))}
    </ol>
  );
}
