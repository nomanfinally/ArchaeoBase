export type CoordinateInput = {
  genetic_id: string | null;
  group_id: string | null;
  locality: string | null;
  political_entity: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CoordinateAssessment = {
  ok: boolean;
  reason: string;
  suggestedLatitude: number | null;
  suggestedLongitude: number | null;
};

type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const COUNTRY_BOUNDS: Record<string, Bounds> = {
  cuba: { west: -85.4, south: 19.4, east: -73.6, north: 23.7 },
  haiti: { west: -74.7, south: 18, east: -71.5, north: 20.2 },
  "dominican republic": { west: -72.2, south: 17.4, east: -68.1, north: 20.1 },
  jamaica: { west: -78.6, south: 17.5, east: -76.1, north: 18.7 },
  bahamas: { west: -80.6, south: 20.8, east: -72.5, north: 27.4 },
  mexico: { west: -118.6, south: 14.2, east: -86.5, north: 33.2 },
  belize: { west: -89.4, south: 15.8, east: -87.4, north: 18.6 },
  guatemala: { west: -92.4, south: 13.6, east: -88, north: 18 },
  honduras: { west: -89.5, south: 12.8, east: -83, north: 16.6 },
  nicaragua: { west: -87.8, south: 10.6, east: -82.6, north: 15.1 },
  "costa rica": { west: -86.2, south: 8, east: -82.4, north: 11.4 },
  panama: { west: -83.2, south: 7, east: -77, north: 9.9 },
  colombia: { west: -79.2, south: -4.5, east: -66.8, north: 13.6 },
  venezuela: { west: -73.6, south: 0.4, east: -59.7, north: 12.6 },
  ecuador: { west: -81.2, south: -5.2, east: -75.1, north: 1.8 },
  peru: { west: -82, south: -18.5, east: -68.5, north: 0.1 },
  bolivia: { west: -70, south: -23.1, east: -57.3, north: -9.5 },
  chile: { west: -76, south: -56.2, east: -66.4, north: -17.2 },
  argentina: { west: -73.7, south: -55.2, east: -53.6, north: -21.6 },
  brazil: { west: -74.1, south: -34.2, east: -34.2, north: 5.5 },
  uruguay: { west: -58.6, south: -35.2, east: -53, north: -30 },
  paraguay: { west: -62.8, south: -27.7, east: -54, north: -19.2 },
  india: { west: 68, south: 6, east: 98, north: 37.5 },
  pakistan: { west: 60.8, south: 23.4, east: 77.9, north: 37.2 },
  nepal: { west: 80, south: 26, east: 89, north: 31 },
  bangladesh: { west: 88, south: 20.4, east: 92.8, north: 26.8 },
  "sri lanka": { west: 79.4, south: 5.7, east: 82.1, north: 10.1 },
  china: { west: 73, south: 18, east: 135.5, north: 53.8 },
  japan: { west: 122, south: 24, east: 146, north: 46 },
  korea: { west: 124, south: 33, east: 132, north: 43.5 },
  turkey: { west: 25.5, south: 35.5, east: 45.2, north: 42.5 },
  greece: { west: 19, south: 34, east: 30.5, north: 42.2 },
  italy: { west: 6.2, south: 35.3, east: 18.9, north: 47.2 },
  spain: { west: -10, south: 35, east: 4.8, north: 44.4 },
  portugal: { west: -10, south: 36.6, east: -6, north: 42.4 },
  france: { west: -5.6, south: 41, east: 9.8, north: 51.4 },
  germany: { west: 5.5, south: 47, east: 15.5, north: 55.5 },
  poland: { west: 14, south: 49, east: 24.5, north: 55 },
  ukraine: { west: 22, south: 44, east: 41, north: 52.6 },
  russia: { west: 19, south: 41, east: 180, north: 82 },
  egypt: { west: 24, south: 21.5, east: 36.9, north: 32 },
  morocco: { west: -13.5, south: 27, east: -1, north: 36.2 },
  tunisia: { west: 7, south: 30, east: 12.2, north: 37.6 },
  algeria: { west: -9, south: 18, east: 12.2, north: 37.5 },
  israel: { west: 34, south: 29.3, east: 36, north: 33.4 },
  jordan: { west: 34.8, south: 29, east: 39.4, north: 33.6 },
  iran: { west: 44, south: 24, east: 64.2, north: 40.2 },
  iraq: { west: 38.5, south: 29, east: 49, north: 37.5 },
  syria: { west: 35.5, south: 32, east: 42.5, north: 37.5 },
  lebanon: { west: 35, south: 33, east: 36.8, north: 34.8 }
};

function normalizeEntity(value: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\(.+\)/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundsForEntity(value: string | null) {
  const normalized = normalizeEntity(value);
  if (!normalized) return null;
  if (COUNTRY_BOUNDS[normalized]) return COUNTRY_BOUNDS[normalized];
  const tokenMatch = Object.entries(COUNTRY_BOUNDS).find(([name]) => normalized === name || normalized.includes(name));
  return tokenMatch?.[1] ?? null;
}

function contains(bounds: Bounds, latitude: number, longitude: number, padding = 1.5) {
  return (
    latitude >= bounds.south - padding &&
    latitude <= bounds.north + padding &&
    longitude >= bounds.west - padding &&
    longitude <= bounds.east + padding
  );
}

export function assessCoordinate(row: CoordinateInput): CoordinateAssessment {
  const latitude = row.latitude;
  const longitude = row.longitude;
  if (latitude === null || longitude === null) {
    return { ok: false, reason: "Missing coordinate", suggestedLatitude: null, suggestedLongitude: null };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, reason: "Coordinate outside valid latitude/longitude range", suggestedLatitude: null, suggestedLongitude: null };
  }

  const countryBounds = boundsForEntity(row.political_entity);
  if (countryBounds && !contains(countryBounds, latitude, longitude)) {
    if (contains(countryBounds, latitude, -longitude)) {
      return {
        ok: false,
        reason: "Coordinate falls outside the political entity; longitude sign may be reversed",
        suggestedLatitude: latitude,
        suggestedLongitude: -longitude
      };
    }

    if (contains(countryBounds, longitude, latitude)) {
      return {
        ok: false,
        reason: "Coordinate falls outside the political entity; latitude/longitude may be swapped",
        suggestedLatitude: longitude,
        suggestedLongitude: latitude
      };
    }

    return {
      ok: false,
      reason: "Coordinate falls outside the expected political entity region",
      suggestedLatitude: null,
      suggestedLongitude: null
    };
  }

  return { ok: true, reason: "", suggestedLatitude: null, suggestedLongitude: null };
}
