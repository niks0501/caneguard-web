import { historyEvents } from "./publicContent";

export function HistoryTimeline() {
  return (
    <ol className="pub-timeline">
      {historyEvents.map((event) => (
        <li
          key={event.id}
          className={
            event.hardship
              ? "pub-timeline__item pub-timeline__item--hard"
              : "pub-timeline__item"
          }
        >
          <span className="pub-timeline__when">{event.when}</span>
          <div>
            <h3>{event.title}</h3>
            <p>{event.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
