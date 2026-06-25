import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Grants the calling user the 'agent' role if they have no staff role yet.
 * Used by the admin/agent portal signup flow so newly-created staff accounts
 * can immediately sign in to the staff portal.
 */
export const claimStaffRoleIfMissing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const hasStaff = (existing ?? []).some((r) => r.role === "admin" || r.role === "agent");
    if (hasStaff) return { granted: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "agent" });
    if (error) throw new Error(error.message);
    return { granted: true };
  });
