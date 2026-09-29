import type { SectionView } from "@/lib/today-view";
import { JobCard } from "./job-card";

export function TodaySection({ section }: { section: SectionView }) {
  const headingId = `section-${section.category}`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 flex items-center gap-2 text-base font-semibold text-stone-800">
        {section.title}
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-sm font-semibold text-stone-700 tabular-nums">
          {section.cards.length}
        </span>
      </h2>
      <ul className="space-y-3">
        {section.cards.map((card) => (
          <li key={card.jobId}>
            <JobCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}
