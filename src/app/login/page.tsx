import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { authConfig, safeNextPath } from "@/lib/auth";
import { isSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in · Callbook",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const raw = (await searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  if (await isSignedIn()) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-stone-950">Callbook</h1>
      <p className="mt-1 text-stone-700">Sign in to see today&apos;s calls.</p>
      {authConfig() ? (
        <LoginForm next={next} />
      ) : (
        <p role="alert" className="mt-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          Sign-in isn&apos;t set up yet. Set <code>CALLBOOK_PASSWORD</code> and <code>AUTH_SECRET</code> (at least 32
          characters), then restart.
        </p>
      )}
    </main>
  );
}
