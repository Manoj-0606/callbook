import Link from "next/link";
import { NavLink } from "./nav-link";
import { NewRequestLauncher } from "./new-request/new-request-launcher";
import { SignOutButton } from "./sign-out-button";

/** Today, Jobs, and "+ New request", which works from every page. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-1 px-4 sm:px-6">
        <Link
          href="/"
          className="mr-auto rounded-md text-lg font-bold tracking-tight text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          Callbook
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <NavLink href="/">Today</NavLink>
          <NavLink href="/jobs">Jobs</NavLink>
          <NewRequestLauncher />
          {/* On phones there's no room here, so it sits at the bottom of the page instead. */}
          <div className="ml-1 hidden sm:block">
            <SignOutButton />
          </div>
        </nav>
      </div>
    </header>
  );
}
