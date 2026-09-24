/**
 * Nasugbu barangay reference points for the dashboard map's default layer
 * (overhaul §3.4). Coordinates mirror the API seeder's checked envelope
 * (DashboardReportSeeder::BARANGAY_COORDINATES, verified against the OSM
 * Nasugbu municipal relation); counts always come from the analytics
 * aggregate, never from this file.
 */
export interface BarangayReferencePoint {
  barangay: string;
  latitude: number;
  longitude: number;
}

export const NASUGBU_BARANGAY_POINTS: BarangayReferencePoint[] = [
  { barangay: "Aga", latitude: 14.09, longitude: 120.7792 },
  { barangay: "Balaytigui", latitude: 14.126, longitude: 120.6039 },
  { barangay: "Banilad", latitude: 14.073, longitude: 120.7408 },
  { barangay: "Bilaran", latitude: 14.0487, longitude: 120.6846 },
  { barangay: "Bucana", latitude: 14.0678, longitude: 120.6267 },
  { barangay: "Bulihan", latitude: 14.1552, longitude: 120.654 },
  { barangay: "Bunducan", latitude: 14.1069, longitude: 120.6521 },
  { barangay: "Butucan", latitude: 14.1394, longitude: 120.6805 },
  { barangay: "Calayo", latitude: 14.1461, longitude: 120.6141 },
  { barangay: "Catandaan", latitude: 14.0804, longitude: 120.6815 },
  { barangay: "Cogunan", latitude: 14.0625, longitude: 120.6555 },
  { barangay: "Dayap", latitude: 14.1013, longitude: 120.6627 },
];

export const NASUGBU_MAP_CENTER = {
  longitude: 120.67,
  latitude: 14.1,
  zoom: 10.5,
} as const;
