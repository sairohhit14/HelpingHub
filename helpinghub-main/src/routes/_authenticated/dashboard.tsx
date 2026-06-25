import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ticket-badges";
import { formatDate } from "@/lib/tickets";
import { Ticket, PlusCircle, TrendingUp } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HelpDesk" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, isAdmin, isAgent } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, isAdmin, isAgent],
    enabled: !!user,
    queryFn: async () => {
      const counts: Record<string, number> = {};
      const statuses = ["open", "assigned", "in_progress", "pending_customer", "resolved", "closed"] as const;
      for (const s of statuses) {
        const q = supabase.from("tickets").select("*", { count: "exact", head: true }).eq("status", s);
        if (!isAdmin && !isAgent) q.eq("customer_id", user!.id);
        const { count } = await q;
        counts[s] = count ?? 0;
      }
      const totalQ = supabase.from("tickets").select("*", { count: "exact", head: true });
      if (!isAdmin && !isAgent) totalQ.eq("customer_id", user!.id);
      const { count: total } = await totalQ;
      counts.total = total ?? 0;

      let users = 0, agents = 0;
      if (isAdmin) {
        const { count: pc } = await supabase.from("profiles").select("*", { count: "exact", head: true });
        users = pc ?? 0;
        const { count: ac } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "agent");
        agents = ac ?? 0;
      }
      return { ...counts, users, agents } as Record<string, number>;
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-tickets", user?.id, isAdmin, isAgent],
    enabled: !!user,
    queryFn: async () => {
      const q = supabase.from("tickets")
        .select("id, ticket_number, subject, status, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (!isAdmin && !isAgent) q.eq("customer_id", user!.id);
      const { data } = await q;
      return data ?? [];
    },
  });

  const chart = [
    { name: "Open", value: stats?.open ?? 0 },
    { name: "Assigned", value: stats?.assigned ?? 0 },
    { name: "In Progress", value: stats?.in_progress ?? 0 },
    { name: "Pending", value: stats?.pending_customer ?? 0 },
    { name: "Resolved", value: stats?.resolved ?? 0 },
    { name: "Closed", value: stats?.closed ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Full system overview" : isAgent ? "Agent overview" : "Your support tickets at a glance"}
          </p>
        </div>
        <Link to="/tickets/new"><Button><PlusCircle className="mr-2 h-4 w-4" />Ticket Problem</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={stats?.total ?? 0} accent="text-primary" />
        <StatCard label="Open" value={stats?.open ?? 0} accent="text-status-open" />
        <StatCard label="In Progress" value={stats?.in_progress ?? 0} accent="text-status-in-progress" />
        <StatCard label="Resolved" value={stats?.resolved ?? 0} accent="text-status-resolved" />
        {isAdmin && (
          <>
            <StatCard label="Users" value={stats?.users ?? 0} />
            <StatCard label="Agents" value={stats?.agents ?? 0} />
            <StatCard label="Pending" value={stats?.pending_customer ?? 0} accent="text-status-pending" />
            <StatCard label="Closed" value={stats?.closed ?? 0} accent="text-status-closed" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Tickets by status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={chart}>
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Ticket className="h-4 w-4" /> Recent</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(recent ?? []).length === 0 && <p className="text-sm text-muted-foreground">No tickets yet.</p>}
            {(recent ?? []).map((t) => (
              <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="block rounded-md border p-3 hover:bg-accent/40">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{t.ticket_number}</span>
                  <span>{formatDate(t.created_at)}</span>
                </div>
                <div className="mt-1 truncate font-medium">{t.subject}</div>
                <div className="mt-2 flex gap-2">
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-2 text-3xl font-semibold ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
