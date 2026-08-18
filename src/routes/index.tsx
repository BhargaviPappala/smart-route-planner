import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import {
  Route as RouteIcon,
  MapPin,
  Plus,
  Trash2,
  RotateCcw,
  Zap,
  Leaf,
  Ruler,
  Clock,
  Gauge,
  History,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optimizeRoute } from "@/lib/route.functions";

const RouteMap = lazy(() => import("@/components/RouteMap"));

type Preference = "fastest" | "shortest" | "eco";

interface HistoryEntry {
  at: string;
  preference: Preference;
  stops: number;
  distanceKm: number;
  durationMin: number;
  start: string;
}

const PREFS: { id: Preference; label: string; hint: string; icon: typeof Zap }[] = [
  { id: "fastest", label: "Fastest", hint: "Traffic-aware travel time", icon: Zap },
  { id: "shortest", label: "Shortest", hint: "Minimum road distance", icon: Ruler },
  { id: "eco", label: "Eco", hint: "Lowest CO₂ emissions", icon: Leaf },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Route Optimizer — Smart Multi-Stop Delivery Routing" },
      {
        name: "description",
        content:
          "Plan multi-stop delivery routes with AI. Compare fastest, shortest and eco routes with live distance, ETA and CO₂ savings on an interactive map.",
      },
      { property: "og:title", content: "AI Route Optimizer — Smart Multi-Stop Delivery Routing" },
      {
        property: "og:description",
        content:
          "TSP-based route optimization with traffic prediction, interactive mapping and CO₂ savings analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [start, setStart] = useState("Connaught Place, New Delhi");
  const [stops, setStops] = useState<string[]>([
    "India Gate, New Delhi",
    "Qutub Minar, New Delhi",
    "Lotus Temple, New Delhi",
    "Red Fort, New Delhi",
  ]);
  const [preference, setPreference] = useState<Preference>("fastest");
  const [departureHour, setDepartureHour] = useState(9);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("route-history");
      if (raw) setHistory(JSON.parse(raw) as HistoryEntry[]);
    } catch {
      /* ignore corrupt history */
    }
  }, []);

  const fn = useServerFn(optimizeRoute);
  const mutation = useMutation({
    mutationFn: (input: {
      start: string;
      stops: string[];
      preference: Preference;
      departureHour: number;
      weekend: boolean;
    }) => fn({ data: input }),
    onSuccess: (res) => {
      const entry: HistoryEntry = {
        at: new Date().toISOString(),
        preference: res.preference,
        stops: res.order.length - 1,
        distanceKm: res.distanceKm,
        durationMin: res.durationMin,
        start: res.order[0]?.label ?? "",
      };
      const next = [entry, ...history].slice(0, 8);
      setHistory(next);
      localStorage.setItem("route-history", JSON.stringify(next));
      toast.success(`Route optimized across ${res.order.length} points`);
    },
    onError: (e: Error) => toast.error(e.message || "Could not optimize this route"),
  });

  const result = mutation.data;

  function submit() {
    const cleanStops = stops.map((s) => s.trim()).filter(Boolean);
    if (!start.trim()) return toast.error("Add a starting location");
    if (cleanStops.length < 1) return toast.error("Add at least one stop");
    const day = new Date().getDay();
    mutation.mutate({
      start: start.trim(),
      stops: cleanStops,
      preference,
      departureHour,
      weekend: day === 0 || day === 6,
    });
  }

  function reset() {
    setStart("");
    setStops(["", "", ""]);
    setPreference("fastest");
    mutation.reset();
  }

  const points = result?.order ?? [];

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <Toaster position="top-right" />
      <header className="mx-auto mb-8 flex max-w-7xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <RouteIcon className="h-3.5 w-3.5 text-primary" />
            TSP solver · traffic model · emissions analytics
          </div>
          <h1 className="text-3xl font-bold md:text-5xl">
            AI <span className="text-gradient">Route Optimizer</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
            Order multi-stop delivery runs optimally with a 2-opt TSP solver over live road-network
            data, tuned for speed, distance or lowest emissions.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[380px_1fr]">
        <section className="panel space-y-5 p-5">
          <div className="space-y-2">
            <Label htmlFor="start" className="text-xs uppercase tracking-wide text-muted-foreground">
              Start location
            </Label>
            <div className="relative">
              <Navigation className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                id="start"
                value={start}
                maxLength={200}
                onChange={(e) => setStart(e.target.value)}
                placeholder="Address or lat,lon"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Stops ({stops.length})
              </Label>
              <Button
                size="sm"
                variant="secondary"
                disabled={stops.length >= 12}
                onClick={() => setStops([...stops, ""])}
              >
                <Plus className="h-4 w-4" /> Add stop
              </Button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {stops.map((s, i) => (
                <div key={i} className="relative flex items-center gap-2">
                  <MapPin className="absolute left-3 h-4 w-4 text-accent" />
                  <Input
                    value={s}
                    maxLength={200}
                    onChange={(e) =>
                      setStops(stops.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder={`Stop ${i + 1} — address or lat,lon`}
                    className="pl-9"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove stop ${i + 1}`}
                    onClick={() => setStops(stops.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: click anywhere on the map to append those coordinates as a stop.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Optimization preference
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {PREFS.map((p) => {
                const Icon = p.icon;
                const active = preference === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPreference(p.id)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      active
                        ? "border-primary bg-primary/10 shadow-[var(--shadow-glow)]"
                        : "border-border bg-secondary/40 hover:border-primary/50"
                    }`}
                  >
                    <Icon className={`mb-1 h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="text-sm font-semibold">{p.label}</div>
                    <div className="text-[11px] leading-tight text-muted-foreground">{p.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hour" className="text-xs uppercase tracking-wide text-muted-foreground">
              Departure hour (traffic model): {String(departureHour).padStart(2, "0")}:00
            </Label>
            <input
              id="hour"
              type="range"
              min={0}
              max={23}
              value={departureHour}
              onChange={(e) => setDepartureHour(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={submit} disabled={mutation.isPending}>
              <RouteIcon className="h-4 w-4" />
              {mutation.isPending ? "Optimizing…" : "Optimize route"}
            </Button>
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        </section>

        <section className="space-y-6">
          <div className="panel h-[420px] overflow-hidden p-0 md:h-[520px]">
            <ClientOnly fallback={<div className="h-full w-full bg-muted/20" />}>
              <Suspense fallback={<div className="h-full w-full bg-muted/20" />}>
                <RouteMap
                  points={points}
                  geometry={result?.geometry ?? []}
                  onPick={(lat, lon) =>
                    setStops((prev) => [...prev, `${lat.toFixed(5)},${lon.toFixed(5)}`])
                  }
                />
              </Suspense>
            </ClientOnly>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Stat
              icon={Ruler}
              label="Total distance"
              value={result ? `${result.distanceKm.toFixed(1)} km` : "—"}
            />
            <Stat
              icon={Clock}
              label="Estimated time"
              value={result ? formatMin(result.durationMin) : "—"}
            />
            <Stat
              icon={Gauge}
              label="Traffic factor"
              value={result ? `${result.trafficFactor.toFixed(2)}×` : "—"}
            />
            <Stat
              icon={Leaf}
              label={preference === "eco" ? "CO₂ saved" : "CO₂ emitted"}
              value={
                result
                  ? `${(preference === "eco" ? result.co2SavedKg : result.co2Kg).toFixed(2)} kg`
                  : "—"
              }
            />
          </div>

          {result && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="panel p-5">
                <h2 className="mb-3 text-lg font-semibold">Optimized stop order</h2>
                <ol className="space-y-2">
                  {result.order.map((p, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-lg bg-secondary/40 p-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {i === 0 ? "S" : i}
                      </span>
                      <span className="text-sm">{p.label}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="panel p-5">
                <h2 className="mb-3 text-lg font-semibold">Turn-by-turn directions</h2>
                {result.steps.length ? (
                  <ol className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-sm text-muted-foreground">
                    {result.steps.map((s, i) => (
                      <li key={i} className="flex justify-between gap-3 border-b border-border/60 pb-1.5">
                        <span className="text-foreground/90">{s.instruction}</span>
                        <span className="shrink-0 tabular-nums">{s.distanceKm.toFixed(2)} km</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Directions unavailable for this route.
                  </p>
                )}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="panel p-5">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <History className="h-4 w-4 text-primary" /> Route history
              </h2>
              <ul className="space-y-2 text-sm">
                {history.map((h, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2"
                  >
                    <span className="text-foreground/90">{h.start || "Route"}</span>
                    <span className="text-muted-foreground">
                      {h.stops} stops · {h.distanceKm.toFixed(1)} km · {formatMin(h.durationMin)} ·{" "}
                      {h.preference}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function formatMin(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <div className="font-display text-2xl font-bold">{value}</div>
    </div>
  );
}
