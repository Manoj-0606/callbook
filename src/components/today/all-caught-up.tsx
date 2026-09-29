import { Icon } from "../icons";

export function AllCaughtUp({ message }: { message: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
      <Icon name="check" className="mx-auto size-12 text-emerald-600" />
      <h2 className="mt-4 text-2xl font-semibold text-stone-950">You&apos;re all caught up.</h2>
      <p className="mx-auto mt-2 max-w-sm text-stone-600">{message}</p>
    </section>
  );
}
