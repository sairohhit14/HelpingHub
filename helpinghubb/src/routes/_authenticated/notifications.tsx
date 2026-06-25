import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/tickets";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — HelpDesk" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  const markOne = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
    if (error) return;
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
  };

  const markAll = async () => {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Open a message to mark it as read.</p>
        </div>
        <Button variant="outline" onClick={markAll}><Check className="mr-2 h-4 w-4" />Mark all read</Button>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 h-6 w-6" />No notifications yet.
            </div>
          )}
          {items.map((n) => {
            const onClick = async () => {
              if (!n.read_at) await markOne(n.id);
              if (n.ticket_id) navigate({ to: "/tickets/$id", params: { id: n.ticket_id } });
            };
            return (
              <button
                key={n.id}
                onClick={onClick}
                className={`block w-full text-left hover:bg-accent/30 ${!n.read_at ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-start gap-3 p-4">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${!n.read_at ? "bg-primary" : "bg-muted"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{n.title}</div>
                    {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                    <div className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
