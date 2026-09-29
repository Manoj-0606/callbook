import type { Metadata } from "next";
import { PublicRequest } from "@/components/public-request/public-request-form";
import { BUSINESS_NAME, BUSINESS_PHONE } from "@/lib/config";

export const metadata: Metadata = {
  title: { absolute: `Request service · ${BUSINESS_NAME}` },
  description: `Tell ${BUSINESS_NAME} what's wrong and we'll call you back.`,
};

/** The public "Request service" page on the company website. Needs no data, so it's a static page. */
export default function RequestServicePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
      <h1 className="text-3xl font-bold tracking-tight text-stone-950 sm:text-4xl">Request service</h1>
      <p className="mt-2 text-lg text-stone-700">
        Tell us what&apos;s wrong and we&apos;ll call you back. For an emergency, you can also call us at{" "}
        <a href={`tel:+1${BUSINESS_PHONE.replace(/\D/g, "")}`} className="font-semibold whitespace-nowrap text-emerald-800 underline underline-offset-2">
          {BUSINESS_PHONE}
        </a>
        .
      </p>
      <PublicRequest />
    </main>
  );
}
