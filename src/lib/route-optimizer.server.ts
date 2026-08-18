/**
 * Route optimization core: geocoding, distance matrix, TSP heuristic
 * (nearest-neighbour construction + 2-opt improvement) and emission modelling.
 * Server-only module — never imported by client code directly.
 */

export type Preference = "fastest" | "shortest" | "eco";

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export interface OptimizedRoute {
  preference: Preference;
  order: Place[];
  distanceKm: number;
  durationMin: number;
  co2Kg: number;
  co2SavedKg: number;
  naiveDistanceKm: number;
  geometry: [number, number][]; // [lat, lon]
  steps: { instruction: string; distanceKm: number }[];
  trafficFactor: number;
}

const OSRM = "https://router.project-osrm.org";
const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA = "AI-Route-Optimizer/1.0 (portfolio project)";

/** Resolve a free-text address or "lat,lon" pair into coordinates. */
export async function geocode(query: string): Promise<Place> {
  const coordMatch = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lon = Number(coordMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon };
    }
  }
  const url = `${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocoding failed for "${query}"`);
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!data.length) throw new Error(`No location found for "${query}"`);
  return {
    label: data[0].display_name.split(",").slice(0, 3).join(",").trim(),
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
  };
}

function haversine(a: Place, b: Place) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface Matrix {
  distances: number[][]; // km
  durations: number[][]; // minutes
}

/** Road-network matrix from OSRM, with a great-circle fallback if OSRM is unreachable. */
async function distanceMatrix(places: Place[]): Promise<Matrix> {
  const coords = places.map((p) => `${p.lon},${p.lat}`).join(";");
  try {
    const res = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=duration,distance`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error("table failed");
    const json = (await res.json()) as {
      distances?: number[][];
      durations?: number[][];
    };
    if (json.distances && json.durations) {
      return {
        distances: json.distances.map((r) => r.map((v) => (v ?? 0) / 1000)),
        durations: json.durations.map((r) => r.map((v) => (v ?? 0) / 60)),
      };
    }
    throw new Error("incomplete table");
  } catch {
    const distances = places.map((a) => places.map((b) => haversine(a, b) * 1.3));
    return { distances, durations: distances.map((r) => r.map((d) => (d / 45) * 60)) };
  }
}

/** Lightweight learned model: traffic multiplier by hour-of-day (weekday rush peaks). */
export function trafficFactor(hour: number, weekend: boolean) {
  const base = [
    0.85, 0.82, 0.8, 0.8, 0.84, 0.95, 1.12, 1.32, 1.4, 1.22, 1.08, 1.05, 1.1, 1.08, 1.06, 1.14,
    1.3, 1.45, 1.38, 1.2, 1.05, 0.96, 0.9, 0.87,
  ];
  const f = base[((hour % 24) + 24) % 24];
  return weekend ? 1 + (f - 1) * 0.45 : f;
}

function tourCost(order: number[], cost: number[][]) {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += cost[order[i]][order[i + 1]];
  return total;
}

/** Nearest-neighbour construction followed by 2-opt local search (open TSP path). */
function solveTsp(cost: number[][]): number[] {
  const n = cost.length;
  const visited = new Set<number>([0]);
  const order = [0];
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && cost[last][j] < bestCost) {
        bestCost = cost[last][j];
        best = j;
      }
    }
    order.push(best);
    visited.add(best);
  }

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, k + 1).reverse(),
          ...order.slice(k + 1),
        ];
        if (tourCost(candidate, cost) + 1e-9 < tourCost(order, cost)) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return order;
}

async function routeGeometry(places: Place[]) {
  const coords = places.map((p) => `${p.lon},${p.lat}`).join(";");
  try {
    const res = await fetch(
      `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
      { headers: { "User-Agent": UA } },
    );
    if (!res.ok) throw new Error("route failed");
    const json = (await res.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs: Array<{
          steps: Array<{ distance: number; name: string; maneuver: { type: string; modifier?: string } }>;
        }>;
      }>;
    };
    const r = json.routes?.[0];
    if (!r) throw new Error("no route");
    const steps = r.legs
      .flatMap((l) => l.steps)
      .filter((s) => s.maneuver.type !== "arrive")
      .slice(0, 60)
      .map((s) => ({
        instruction: `${s.maneuver.type}${s.maneuver.modifier ? ` ${s.maneuver.modifier}` : ""}${
          s.name ? ` onto ${s.name}` : ""
        }`.replace(/^./, (c) => c.toUpperCase()),
        distanceKm: s.distance / 1000,
      }));
    return {
      geometry: r.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
      steps,
    };
  } catch {
    return {
      geometry: places.map((p) => [p.lat, p.lon] as [number, number]),
      distanceKm: 0,
      durationMin: 0,
      steps: [],
    };
  }
}

export async function optimize(
  places: Place[],
  preference: Preference,
  departureHour: number,
  weekend: boolean,
): Promise<OptimizedRoute> {
  const { distances, durations } = await distanceMatrix(places);
  const factor = trafficFactor(departureHour, weekend);

  // Eco mode penalises stop-and-go distance more heavily; fastest weights predicted traffic.
  const cost = distances.map((row, i) =>
    row.map((d, j) => {
      const t = durations[i][j] * factor;
      if (preference === "shortest") return d;
      if (preference === "fastest") return t;
      return d * 0.7 + t * 0.3;
    }),
  );

  const order = solveTsp(cost);
  const ordered = order.map((i) => places[i]);
  const naiveDistanceKm = tourCost(
    places.map((_, i) => i),
    distances,
  );

  const road = await routeGeometry(ordered);
  const distanceKm =
    road.distanceKm > 0
      ? road.distanceKm
      : tourCost(order, distances);
  const durationMin =
    (road.durationMin > 0 ? road.durationMin : tourCost(order, durations)) * factor;

  // Emission model: 0.192 kg CO2/km van baseline, 12% lower with eco driving profile.
  const rate = preference === "eco" ? 0.192 * 0.88 : 0.192;
  const co2Kg = distanceKm * rate;
  const co2SavedKg = Math.max(0, naiveDistanceKm * 0.192 - co2Kg);

  return {
    preference,
    order: ordered,
    distanceKm,
    durationMin,
    co2Kg,
    co2SavedKg,
    naiveDistanceKm,
    geometry: road.geometry,
    steps: road.steps,
    trafficFactor: factor,
  };
}
