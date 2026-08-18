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
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { geocode, optimize } = await import("./route-optimizer.server");
    const queries = [data.start, ...data.stops];
    const places = [];
    // Nominatim allows ~1 request/second: geocode sequentially with throttling + one retry.
    for (const [i, q] of queries.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 350));
      try {
        places.push(await geocode(q));
      } catch (err) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          places.push(await geocode(q));
        } catch {
          throw err;
        }
      }
    }
    return optimize(places, data.preference, data.departureHour, data.weekend);
  });
