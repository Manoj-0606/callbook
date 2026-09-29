import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { FlashProvider } from "@/components/flash-provider";
import { SignOutButton } from "@/components/sign-out-button";
import { isSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Callbook", template: "%s · Callbook" },
  description: "Who to call today, and where every job stands.",
  // Denise's internal pages: keep them out of search engines.
  robots: { index: false, follow: false },
};

/**
 * Denise's app: Today, Jobs, job and customer pages. The proxy already sends
 * signed-out visitors to /login; this check is a second line of defence.
 */
export default async function CallbookLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSignedIn())) redirect("/login");

  return (
    <FlashProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-stone-900 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <AppHeader />
      <div id="main-content" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {children}
      </div>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-8 sm:hidden">
        <SignOutButton />
      </footer>
    </FlashProvider>
  );
}
