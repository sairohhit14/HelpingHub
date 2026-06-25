import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin-login")({
  head: () => ({ meta: [{ title: "Admin / Agent sign-in — HelpDesk" }] }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const ensureStaffAndGo = async (userId: string) => {
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const hasStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "agent");
    if (!hasStaff) {
      await supabase.auth.signOut();
      toast.error("This portal is for admins and agents only.");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  };

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) return toast.error("Enter valid email and password");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setLoading(false);
      return toast.error(error?.message ?? "Sign-in failed");
    }
    await ensureStaffAndGo(data.user.id);
    setLoading(false);
  };

  const onForgot = async () => {
    const target = window.prompt("Enter your staff email to receive a password reset link:", email);
    if (!target) return;
    const { error } = await supabase.auth.resetPasswordForEmail(target.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your email.");
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary/50 px-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-elevated)]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <CardTitle>Admin / Agent portal</CardTitle>
          <CardDescription>Restricted to authorized staff accounts only.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSignIn} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email_in">Email</Label>
              <Input id="email_in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password_in">Password</Label>
              <Input id="password_in" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>Sign in</Button>
            <button
              type="button"
              onClick={onForgot}
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Access is restricted. Contact your administrator if you need credentials.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
