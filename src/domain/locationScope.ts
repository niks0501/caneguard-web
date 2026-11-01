/**
 * Known barangay choices for the Monitoring Map and List filters.
 *
 * Mirrors the authoritative `/api/v1/reference/locations` scope served by
 * `LocationReferenceController`. Offering these as choices keeps Barangay
 * filtering from depending on exact free-text spelling while the free-text
 * filter parameter stays backward compatible.
 */
export const knownBarangays: readonly string[] = [
  "Aga",
  "Balaytigui",
  "Banilad",
  "Barangay 1 (Poblacion)",
  "Barangay 10 (Poblacion)",
  "Barangay 11 (Poblacion)",
  "Barangay 12 (Poblacion)",
  "Barangay 2 (Poblacion)",
  "Barangay 3 (Poblacion)",
  "Barangay 4 (Poblacion)",
  "Barangay 5 (Poblacion)",
  "Barangay 6 (Poblacion)",
  "Barangay 7 (Poblacion)",
  "Barangay 8 (Poblacion)",
  "Barangay 9 (Poblacion)",
  "Bilaran",
  "Bucana",
  "Bulihan",
  "Bunducan",
  "Butucan",
  "Calayo",
  "Catandaan",
  "Cogunan",
  "Dayap",
  "Kaylaway",
  "Kayrilaw",
  "Latag",
  "Looc",
  "Lumbangan",
  "Malapad na Bato",
  "Mataas na Pulo",
  "Maugat",
  "Munting Indan",
  "Natipuan",
  "Pantalan",
  "Papaya",
  "Putat",
  "Reparo",
  "Talangan",
  "Tumalim",
  "Utod",
  "Wawa",
] as const;
