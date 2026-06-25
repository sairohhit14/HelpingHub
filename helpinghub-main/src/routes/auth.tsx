import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { platform } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — HelpDesk" }] }),
  component: AuthPage,
});

// "Identifier" = email OR mobile (10–15 digits, optional leading +)
const identifierSchema = z
  .string()
  .trim()
  .refine(
    (v) => /^\S+@\S+\.\S+$/.test(v) || /^\+?\d{10,15}$/.test(v.replace(/[\s-]/g, "")),
    { message: "Enter a valid email or mobile number" },
  );

function isEmail(v: string) {
  return /^\S+@\S+\.\S+$/.test(v.trim());
}

function normalizePhone(v: string) {
  const cleaned = v.trim().replace(/[\s-]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search }) as { mode?: string };
  // Default landing tab is "signup" (create account first) as requested
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(
    search.mode === "signin" ? "signin" : "signup",
  );
  const [loading, setLoading] = useState(false);

  // Forgot-password flow state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const onGoogle = async () => {
    setLoading(true);
    const result = await platform.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error(result.error.message || "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  };

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier") || "");
    const password = String(fd.get("password") || "");
    const idParsed = identifierSchema.safeParse(identifier);
    if (!idParsed.success) return toast.error(idParsed.error.issues[0].message);
    if (password.length < 6) return toast.error("Password must be at least 6 characters");

    setLoading(true);
    const { error } = isEmail(identifier)
      ? await supabase.auth.signInWithPassword({ email: identifier.trim(), password })
      : await supabase.auth.signInWithPassword({ phone: normalizePhone(identifier), password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard", replace: true });
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") || "").trim();
    const identifier = String(fd.get("identifier") || "").trim();
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm_password") || "");

    if (full_name.length < 2) return toast.error("Enter your full name");
    const idParsed = identifierSchema.safeParse(identifier);
    if (!idParsed.success) return toast.error(idParsed.error.issues[0].message);
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords do not match");

    setLoading(true);
    const usingEmail = isEmail(identifier);
    const { error } = usingEmail
      ? await supabase.auth.signUp({
          email: identifier,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name },
          },
        })
      : await supabase.auth.signUp({
          phone: normalizePhone(identifier),
          password,
          options: { data: { full_name, mobile: normalizePhone(identifier) } },
        });
    if (error) { setLoading(false); return toast.error(error.message); }
    // Never auto-login — force the user through the sign-in screen.
    await supabase.auth.signOut();
    setLoading(false);
    toast.success("Account created successfully. Please sign in to continue.");
    setMode("signin");
  };


  const onForgotSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isEmail(forgotEmail)) return toast.error("Enter a valid email");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setForgotSent(true);
    toast.success("Verification link sent to your email");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary/50 px-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-elevated)]">
        <CardHeader className="text-center">
          <Link to="/" className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LifeBuoy className="h-5 w-5" />
          </Link>
          <CardTitle>HelpDesk</CardTitle>
          <CardDescription>Support Ticket System</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "forgot" ? (
            <div className="space-y-3">
              <form onSubmit={onForgotSend} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="forgot_email">Email</Label>
                  <Input
                    id="forgot_email" type="email" required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {forgotSent ? "Resend verification link" : "Send verification link"}
                </Button>
              </form>
              {forgotSent && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                  We sent a secure verification link to <span className="font-medium text-foreground">{forgotEmail}</span>.
                  Open it on this device to set a new password.
                </div>
              )}
              <button type="button" onClick={() => { setMode("signin"); setForgotSent(false); }} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </button>
            </div>
          ) : (
            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                {/* Sign up first, then Sign in */}
                <TabsTrigger value="signup">Create account</TabsTrigger>
                <TabsTrigger value="signin">Sign in</TabsTrigger>
              </TabsList>

              <TabsContent value="signup" className="mt-4 space-y-3">
                <Button type="button" variant="outline" className="w-full" onClick={onGoogle} disabled={loading}>
                  Continue with Google
                </Button>
                <div className="my-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
                </div>
                <form onSubmit={onSignUp} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="full_name">Full name</Label>
                    <Input id="full_name" name="full_name" required minLength={2} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="identifier_up">Email or mobile</Label>
                    <Input id="identifier_up" name="identifier" required placeholder="you@example.com or +911234567890" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password_up">Create password</Label>
                    <Input id="password_up" name="password" type="password" required minLength={6} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="confirm_password">Confirm password</Label>
                    <Input id="confirm_password" name="confirm_password" type="password" required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>Create account</Button>
                </form>
              </TabsContent>

              <TabsContent value="signin" className="mt-4 space-y-3">
                <Button type="button" variant="outline" className="w-full" onClick={onGoogle} disabled={loading}>
                  Continue with Google
                </Button>
                <div className="my-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
                </div>
                <form onSubmit={onSignIn} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="identifier_in">Email or mobile</Label>
                    <Input id="identifier_in" name="identifier" required placeholder="you@example.com or +911234567890" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password_in">Password</Label>
                    <Input id="password_in" name="password" type="password" required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>Sign in</Button>
                  <button type="button" onClick={() => setMode("forgot")} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
                    Forgot password?
                  </button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
