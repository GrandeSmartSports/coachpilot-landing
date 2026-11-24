// CastAI waters feed: one shared source of fishing waters for the Rig Card
// (coachpilot.org/rigs) and CastAI. PUBLIC, read-only, verify_jwt off.
//
// GET ?lat=&lon=&km=   (defaults: Bonney Lake, 260 km, max 450)
// -> { at, center, km, waters: [...], spots: [...] }
//   waters = WDFW-stocked waters CastAI has matched and verified
//            (castai_stocking_waters), each with its trout plants from the
//            last 120 days (castai_stocking_plants, nightly from WDFW) and
//            this year's planned plants (castai_stocking_plan).
//   spots  = CastAI fishing_spots in range (piers, rivers, saltwater...).
//            Spot text in fishing_spots is NOT verified; callers must not
//            present it as fact.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
const num = (v: string | null, d: number, lo: number, hi: number) => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const q = new URL(req.url).searchParams;
    const lat = num(q.get("lat"), 47.177, 45, 49.5), lon = num(q.get("lon"), -122.186, -125, -116.5), R = num(q.get("km"), 260, 10, 450);
    const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const year = new Date().getUTCFullYear();
    const [w, s] = await Promise.all([
      db.from("castai_stocking_waters").select("geo_code,wdfw_name,county,spot_name,lat,lon").eq("state", "WA").eq("verified", true).not("lat", "is", null),
      db.from("fishing_spots").select("id,name,type,latitude,longitude,best_for").eq("state_code", "WA"),
    ]);
    if (w.error) throw w.error;
    if (s.error) throw s.error;
    const waters = (w.data || []).map((x) => ({ geo: x.geo_code, name: x.spot_name, wdfw: x.wdfw_name, county: x.county,
      lat: +x.lat, lon: +x.lon, km: Math.round(km(lat, lon, +x.lat, +x.lon)) })).filter((x) => x.km <= R);
    const geos = waters.map((x) => x.geo);
    const byGeo: Record<string, { plants: unknown[]; plan: unknown[] }> = {};
    geos.forEach((g) => (byGeo[g] = { plants: [], plan: [] }));
    for (let i = 0; i < geos.length; i += 150) {
      const part = geos.slice(i, i + 150);
      const [p, pl] = await Promise.all([
        db.from("castai_stocking_plants").select("geo_code,release_start,species,number_released,fish_per_pound")
          .eq("state", "WA").in("geo_code", part).gte("release_start", since).order("release_start", { ascending: false }),
        db.from("castai_stocking_plan").select("geo_code,species,planned_count,planned_month,size_class")
          .eq("state", "WA").in("geo_code", part).gte("plan_year", year).lte("plan_year", year + 1),
      ]);
      if (p.error) throw p.error;
      if (pl.error) throw pl.error;
      (p.data || []).forEach((x) => byGeo[x.geo_code]?.plants.push({ d: x.release_start, sp: x.species, n: x.number_released, fpp: x.fish_per_pound }));
      (pl.data || []).forEach((x) => byGeo[x.geo_code]?.plan.push({ m: x.planned_month, sp: x.species, n: x.planned_count, size: x.size_class }));
    }
    const out = waters.map((x) => ({ ...x, ...byGeo[x.geo] })).sort((a, b) => a.km - b.km);
    const spots = (s.data || []).map((x) => ({ id: x.id, name: x.name, type: x.type, lat: x.latitude, lon: x.longitude,
      km: Math.round(km(lat, lon, x.latitude, x.longitude)), best_for: x.best_for || [] })).filter((x) => x.km <= R).sort((a, b) => a.km - b.km);
    return new Response(JSON.stringify({ at: new Date().toISOString(), center: { lat, lon }, km: R, waters: out, spots }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800, s-maxage=1800" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
