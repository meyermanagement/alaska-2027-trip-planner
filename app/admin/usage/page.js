import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { foldIntoAreas, totalOf } from "@/lib/usage/features";
import TopBar from "@/components/TopBar";
import UsageBreakdown from "./UsageBreakdown";

export const metadata = { title: "Usage · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The model bill, broken down by the feature that ran it up.
 *
 * Gated like the rest of the admin screens: the allowlist, and a not-found for
 * everybody else, because a 403 tells a stranger there is something here.
 *
 * The adding up happens in the database. Three rollup functions do the grouping
 * over the window, and the page receives a few dozen rows instead of every call
 * of the month -- which is what keeps this screen the same speed in December as
 * it is today. The service key is needed because the usage table is own-rows-only
 * and this screen is deliberately about every account, not this one.
 */

const WINDOWS = [7, 30, 90];
const DEFAULT_WINDOW = 30;

function windowFrom(value) {
  const asked = Number(Array.isArray(value) ? value[0] : value);
  return WINDOWS.includes(asked) ? asked : DEFAULT_WINDOW;
}

export default async function UsagePage({ searchParams }) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) notFound();

  const params = await searchParams;
  const days = windowFrom(params?.days);

  const admin = createAdminClient();
  if (!admin) {
    return (
      <>
        <TopBar />
        <UsageBreakdown days={days} keyMissing />
      </>
    );
  }

  const [byFeature, byModel, daily] = await Promise.all([
    admin.rpc("model_usage_by_feature", { days }),
    admin.rpc("model_usage_by_model", { days }),
    admin.rpc("model_usage_daily", { days }),
  ]);

  const areas = foldIntoAreas(byFeature?.data || []);

  return (
    <>
      <TopBar />
      <UsageBreakdown
        days={days}
        areas={areas}
        models={byModel?.data || []}
        daily={daily?.data || []}
        totals={totalOf(areas)}
      />
    </>
  );
}
