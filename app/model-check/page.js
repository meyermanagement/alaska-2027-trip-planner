import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import ModelCheck from "./ModelCheck";

export const metadata = { title: "Model check · Alyeska" };

/**
 * Which models answer, and what Google says about the ones that do not.
 *
 * It was open to anybody signed in, which was never the intent: the check spends
 * real quota on every model in the ladder, and the answer it prints is about the
 * deployment rather than about the person asking. Behind the allowlist now, and
 * /api/model-check checks the same thing again for itself -- a page that is not
 * drawn is not a route that is closed.
 */
export default async function ModelCheckPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) notFound();
  return <ModelCheck />;
}
