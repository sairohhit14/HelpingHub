import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LifeBuoy, ShieldCheck, Workflow, BarChart3, Ticket } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Support Ticket System" },
      { name: "description", content: "Centralized support for movie, bus, train, flight and event ticket bookings. Create, track, and resolve tickets fast." },
      { property: "og:title", content: "Support Ticket System" },
      { property: "og:description", content: "Centralized support for ticket booking issues across movies, buses, trains, flights and events." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LifeBuoy className="h-4 w-4" />
          </div>
          HelpDesk
        </div>
        <div className="flex items-center gap-2">
          <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
          <Link to="/admin-login"><Button variant="outline">Admin login</Button></Link>
          <Link to="/auth"><Button>Create account</Button></Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center md:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Support Ticket System
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
          SUPPORT TICKET SYSTEM
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          A centralized helpdesk for movie, bus, train, flight and event ticket platforms.
          File a problem, track its progress, and get resolved fast.
        </p>
      </section>

      <section className="border-t bg-secondary/40 py-14">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Feature icon={ShieldCheck} title="Role-based access" body="Customers, agents and admins have purpose-built views and permissions." />
            <Feature icon={Workflow} title="Full audit trail" body="Every status change, assignment and reply is logged automatically." />
            <Feature icon={BarChart3} title="Secure & private" body="Your data is protected with row-level security and encrypted storage." />
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} HelpDesk — Support Ticket System
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Ticket; title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-3 font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
