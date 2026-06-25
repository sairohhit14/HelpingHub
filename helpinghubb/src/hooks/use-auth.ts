import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/tickets";

export interface AuthState {
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isCustomer: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchRoles = async (uid: string) => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!active) return;
      setRoles((data?.map((r) => r.role as AppRole) ?? []));
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        setTimeout(() => fetchRoles(u.id), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) fetchRoles(u.id).finally(() => active && setLoading(false));
      else setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = roles.includes("admin");
  const isAgent = roles.includes("agent");
  return {
    user,
    roles,
    loading,
    isAdmin,
    isAgent,
    isCustomer: roles.includes("customer") && !isAdmin && !isAgent,
  };
}
