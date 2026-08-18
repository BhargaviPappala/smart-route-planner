import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  start: z.string().trim().min(2).max(200),
  stops: z.array(z.string().trim().min(2).max(200)).min(1).max(12),
  preference: z.enum(["fastest", "shortest", "eco"]),
  departureHour: z.number().int().min(0).max(23),
  weekend: z.boolean(),
});

export const optimizeRoute = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { geocode, optimize } = await import("./route-optimizer.server");
    const queries = [data.start, ...data.stops];
    const places = [];
    for (const q of queries) {
      places.push(await geocode(q));
    }
    return optimize(places, data.preference, data.departureHour, data.weekend);
  });
