"use client";

import { useState } from "react";
import type { CallbackChoice } from "@/lib/callback-choices";
import type { LocalDate } from "@/lib/domain";
import { useFlash } from "../flash-provider";
import { Icon } from "../icons";
import { Dialog, DialogContent } from "../ui/responsive-dialog";
import { NewRequestForm } from "./new-request-form";

/** "+ New request" in the header: opens the quick-add sheet/dialog from any page. */
export function NewRequestButton({ today, callbackChoices }: { today: LocalDate; callbackChoices: CallbackChoice[] }) {
  const [open, setOpen] = useState(false);
  const flash = useFlash();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="New request"
        className="ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
      >
        <Icon name="plus" className="size-4" />
        <span className="sm:hidden">New</span>
        <span className="hidden sm:inline">New request</span>
      </button>
      {/* Mounted only while open, so every new request starts from a clean form. */}
      {open && (
        <DialogContent title="New request" description="Phone, name and what's wrong is all you need.">
          <NewRequestForm
            today={today}
            callbackChoices={callbackChoices}
            onDone={(message) => {
              flash(message);
              setOpen(false);
            }}
            onLeave={() => setOpen(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
