import { readView, privateHeaders } from "@/lib/childView/server";
import { coverPath, isId } from "@/lib/childView/interactions";

export const dynamic = "force-dynamic";
const headers = { ...privateHeaders, "X-Content-Type-Options": "nosniff" };
export async function GET(request) {
  const unavailable = () => new Response(null, { status: 404, headers });
  try {
    const tripId = new URL(request.url).searchParams.get("tripId");
    if (!isId(tripId)) return unavailable();
    const ctx = await readView();
    if (!ctx) return unavailable();
    const { data, error } = await ctx.admin.rpc("parent_trip_view_data", { view_hash: ctx.hash });
    const trip = !error && data?.enabled && data.trips?.find(row => row.id === tripId);
    if (!trip) return unavailable();
    const path = coverPath(trip.cover_image_url, process.env.NEXT_PUBLIC_SUPABASE_URL, ctx.view.family_id, tripId);
    if (!path) return unavailable();
    const { data: image, error: imageError } = await ctx.admin.storage.from("trip-covers").download(path);
    if (imageError || !image || image.size > 8 * 1024 * 1024
      || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) return unavailable();
    return new Response(image, { headers: { ...headers, "Content-Type": image.type } });
  } catch { return unavailable(); }
}
