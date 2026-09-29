import type { Metadata } from "next";
import { connection } from "next/server";
import { ActionFormsProvider } from "@/components/action-forms-provider";
import { AllCaughtUp } from "@/components/today/all-caught-up";
import { TodaySection } from "@/components/today/today-section";
import { db } from "@/db";
import { loadTodayView } from "@/db/queries/today";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  // "Today" changes by the minute: always render at request time.
  await connection();
  const view = await loadTodayView(db, new Date());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-stone-500">{view.dateLabel}</p>
        {view.isEmpty ? (
          <h1 className="sr-only">Today</h1>
        ) : (
          <>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-950 sm:text-4xl">
              {view.peopleLabel}
            </h1>
            <p className="mt-1 text-lg text-stone-600">{view.openJobsLabel}</p>
          </>
        )}
      </header>

      <ActionFormsProvider today={view.today} technicians={view.technicians} callbackChoices={view.callbackChoices}>
        {view.isEmpty ? (
          <AllCaughtUp message={view.emptyMessage} />
        ) : (
          <div className="space-y-10">
            {view.sections.map((section) => (
              <TodaySection key={section.category} section={section} />
            ))}
          </div>
        )}
      </ActionFormsProvider>
    </main>
  );
}
