import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — HelpDesk" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, roles } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).single()).data,
  });

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setMobile(profile.mobile ?? "");
    }
  }, [profile]);

  const save = async () => {
    const { error } = await supabase.from("profiles").update({ full_name: name, mobile }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Update your contact details.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
          <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Roles:</span>
            {roles.map((r) => <Badge key={r} variant="outline" className="capitalize">{r}</Badge>)}
          </div>
          <div className="flex justify-end"><Button onClick={save}>Save changes</Button></div>
        </CardContent>
      </Card>

    </div>
  );
}
