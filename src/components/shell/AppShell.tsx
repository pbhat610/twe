"use client";

import { LayoutDashboard, Settings, Users, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Wordmark, cn } from "@/components/ui/primitives";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/pipeline", label: "Video pipeline", icon: Video, match: (p: string) => p.startsWith("/pipeline") || p.startsWith("/interviews") || p.startsWith("/report") },
  { href: "/candidates", label: "Candidates", icon: Users, match: (p: string) => p.startsWith("/candidates") },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

/** Recruiter workspace: fixed side navigation, content on the right. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center px-5">
          <Wordmark suffix="Interviewer" />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2" aria-label="Main">
          {/* The active link depends on the URL, which must render inside Suspense. */}
          <Suspense fallback={<NavLinks path="" />}>
            <ActiveNav />
          </Suspense>
        </nav>
        <div className="border-t border-border px-3 py-3">
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone: top bar with the same links */}
        <nav className="flex h-12 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-3 md:hidden" aria-label="Main">
          <Suspense fallback={<NavLinks path="" compact />}>
            <ActiveNav compact />
          </Suspense>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function ActiveNav({ compact }: { compact?: boolean }) {
  return <NavLinks path={usePathname()} compact={compact} />;
}

function NavLinks({ path, compact }: { path: string; compact?: boolean }) {
  return NAV.map(({ href, label, icon: Icon, match }) => {
    const active = path !== "" && match(path);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 whitespace-nowrap rounded-sm font-medium transition-colors",
          compact ? "px-2.5 py-1.5 text-[13px]" : "px-2.5 py-2 text-[13.5px]",
          active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        {!compact && <Icon className="h-4 w-4" />} {label}
      </Link>
    );
  });
}

/** Page header inside the shell: one title, optional actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-6 py-4">
      <div className="min-w-0 flex-1">
        <h1 className="t-h1">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-faint">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
