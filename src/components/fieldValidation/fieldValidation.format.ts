export function formatValidationDate(value: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
