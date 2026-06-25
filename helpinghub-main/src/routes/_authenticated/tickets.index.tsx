import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/ticket-badges";
import { formatDate, STATUSES } from "@/lib/tickets";
import { PlusCircle, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/tickets/")({
  head: () => ({ meta: [{ title: "Tickets — HelpDesk" }] }),
  component: TicketsList,
});

function TicketsList() {
  const { user, isAdmin, isAgent } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("ticket_categories").select("id, name").order("sort_order")).data ?? [],
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets-list", user?.id, isAdmin, isAgent, status, category, search],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("tickets")
        .select("id, ticket_number, subject, status, priority, created_at, category_id, ticket_categories(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isAdmin && !isAgent) q = q.eq("customer_id", user!.id);
      if (status !== "all") q = q.eq("status", status as never);
      if (category !== "all") q = q.eq("category_id", category);
      if (search.trim()) q = q.or(`ticket_number.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isAdmin || isAgent ? "All tickets" : "My tickets"}</h1>
          <p className="text-sm text-muted-foreground">Search, filter and triage your queue.</p>
        </div>
        <Link to="/tickets/new"><Button><PlusCircle className="mr-2 h-4 w-4" />Ticket Problem</Button></Link>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by ticket # or subject…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && tickets.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No tickets found.</TableCell></TableRow>
            )}
            {tickets.map((t) => (
              <TableRow key={t.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs">
                  <Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.ticket_number}</Link>
                </TableCell>
                <TableCell>
                  <Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.subject}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{(t.ticket_categories as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDate(t.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
