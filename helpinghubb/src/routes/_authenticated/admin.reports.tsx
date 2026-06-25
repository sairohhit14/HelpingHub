import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Reports — Admin" }] }),
  component: AdminReports,
});

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function AdminReports() {
  const { isAdmin } = useAuth();
  const { data: all = [] } = useQuery({
    queryKey: ["report-tickets"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("tickets")
      .select("id, ticket_number, status, priority, created_at, resolved_at, assigned_agent_id, customer_id")
      .limit(5000)).data ?? [],
  });
  const { data: refunds = [] } = useQuery({
    queryKey: ["report-refunds"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("refund_requests").select("*").limit(5000)).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["report-profiles"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("profiles").select("id, full_name").limit(5000)).data ?? [],
  });

  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admins only.</div>;

  // Daily volume (last 14 days)
  const days: { day: string; created: number; resolved: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const day = d.toISOString().slice(0, 10);
    const created = all.filter((t) => new Date(t.created_at) >= d && new Date(t.created_at) < next).length;
    const resolved = all.filter((t) => t.resolved_at && new Date(t.resolved_at) >= d && new Date(t.resolved_at) < next).length;
    days.push({ day: day.slice(5), created, resolved });
  }

  // Agent performance
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name || p.id.slice(0, 8)]));
  const perf: Record<string, { agent: string; total: number; resolved: number }> = {};
  all.forEach((t) => {
    if (!t.assigned_agent_id) return;
    const k = t.assigned_agent_id;
    if (!perf[k]) perf[k] = { agent: nameById.get(k) ?? k.slice(0,8), total: 0, resolved: 0 };
    perf[k].total += 1;
    if (t.status === "resolved" || t.status === "closed") perf[k].resolved += 1;
  });
  const agentChart = Object.values(perf);

  // Refund stats
  const refundStats = {
    pending: refunds.filter((r) => r.status === "pending").length,
    approved: refunds.filter((r) => r.status === "approved").length,
    rejected: refunds.filter((r) => r.status === "rejected").length,
    totalAmount: refunds.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.amount), 0),
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Operational metrics. Export any view as CSV.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Total tickets" value={all.length} />
        <Stat label="Resolved" value={all.filter((t) => t.status === "resolved").length} />
        <Stat label="Open" value={all.filter((t) => t.status === "open").length} />
        <Stat label="Approved refunds" value={`₹${refundStats.totalAmount.toFixed(2)}`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Daily ticket volume — last 14 days</CardTitle>
          <Button variant="outline" size="sm" onClick={() => download("daily_tickets.csv", toCSV(days))}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="var(--primary)" strokeWidth={2} />
                <Line type="monotone" dataKey="resolved" stroke="var(--status-resolved)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Agent performance</CardTitle>
          <Button variant="outline" size="sm" onClick={() => download("agent_performance.csv", toCSV(agentChart))}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
        </CardHeader>
        <CardContent>
          {agentChart.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assigned tickets yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={agentChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="agent" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="total" fill="var(--primary)" radius={[6,6,0,0]} />
                  <Bar dataKey="resolved" fill="var(--status-resolved)" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Refund statistics</CardTitle>
          <Button variant="outline" size="sm" onClick={() => download("refunds.csv", toCSV(refunds as unknown as Record<string, unknown>[]))}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Pending" value={refundStats.pending} />
            <Stat label="Approved" value={refundStats.approved} />
            <Stat label="Rejected" value={refundStats.rejected} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
