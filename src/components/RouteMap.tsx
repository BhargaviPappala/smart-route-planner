import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  label: string;
  lat: number;
  lon: number;
}

function pin(index: number, isStart: boolean) {
  const bg = isStart ? "var(--map-pin-start)" : "var(--map-pin-stop)";
  return L.divIcon({
    className: "",
    html: `<div style="background:${bg}" class="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background text-xs font-bold text-background shadow-lg">${
      isStart ? "S" : index
    }</div>`,
    iconSize: [28, 28],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

function ClickHandler({ onPick }: { onPick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function RouteMap({
  points,
  geometry,
  onPick,
}: {
  points: MapPoint[];
  geometry: [number, number][];
  onPick?: (lat: number, lon: number) => void;
}) {
  const all: [number, number][] = geometry.length
    ? geometry
    : points.map((p) => [p.lat, p.lon]);

  return (
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={4}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "var(--map-canvas)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <ClickHandler onPick={onPick} />
      {geometry.length > 1 && (
        <Polyline positions={geometry} pathOptions={{ color: "#38e2b0", weight: 5, opacity: 0.9 }} />
      )}
      {points.map((p, i) => (
        <Marker key={`${p.lat}-${p.lon}-${i}`} position={[p.lat, p.lon]} icon={pin(i, i === 0)}>
          <Popup>{p.label}</Popup>
        </Marker>
      ))}
      <FitBounds points={all} />
    </MapContainer>
  );
}
