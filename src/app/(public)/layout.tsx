import { BUSINESS_NAME, BUSINESS_PHONE } from "@/lib/config";

/**
 * Customer-facing pages. Only the company's name and number: no Callbook
 * branding, navigation or internal information.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex min-h-14 w-full max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
          <p className="text-lg font-bold tracking-tight text-stone-950">{BUSINESS_NAME}</p>
          <a
            href={`tel:+1${BUSINESS_PHONE.replace(/\D/g, "")}`}
            className="text-sm font-semibold whitespace-nowrap text-emerald-800 underline-offset-2 hover:underline"
          >
            {BUSINESS_PHONE}
          </a>
        </div>
      </header>
      {children}
    </>
  );
}
