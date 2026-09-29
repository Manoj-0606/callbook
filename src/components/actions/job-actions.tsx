"use client";

import { useState } from "react";
import type { ActionKind } from "@/lib/job-actions";
import type { ActionTarget } from "@/lib/today-view";
import { buttonBase } from "../button-styles";
import { useFlash } from "../flash-provider";
import { Dialog, DialogContent } from "../ui/responsive-dialog";
import { ActionForm } from "./action-forms";

type Mode = ActionKind | "menu";

/**
 * A job's lead action and its "More" menu, opening one sheet/dialog. The same
 * component (and the same forms) serve Today cards and the Job Detail page.
 *
 * layout "card":   on phones "More" sits in the card's corner (the card is `relative`).
 * layout "inline": both buttons sit side by side, e.g. on the Job Detail page.
 */
export function JobActions({ card, layout = "card" }: { card: ActionTarget; layout?: "card" | "inline" }) {
  const confirm = useFlash();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");

  function openWith(next: Mode) {
    setMode(next);
    setOpen(true);
  }

  function finished(message: string) {
    confirm(`${card.name}: ${message}`);
    setOpen(false);
  }

  const { primary, more } = card.actions;
  const current = mode === "menu" ? null : (more.find((a) => a.kind === mode) ?? primary);
  const title = current ? current.title : "What do you want to do?";
  const moreButtonLayout =
    layout === "card"
      ? "absolute top-3 right-3 size-10 sm:static sm:h-auto sm:min-h-10 sm:w-full sm:gap-1.5 sm:text-sm sm:font-medium"
      : "min-h-11 gap-1.5 border border-stone-300 bg-white px-4 text-base font-semibold text-stone-900 hover:bg-stone-50";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => openWith(primary.kind)}
        className={`${buttonBase} flex-none border border-stone-300 bg-white whitespace-nowrap text-stone-900 hover:bg-stone-50`}
      >
        {primary.label}
      </button>
      {more.length > 0 && (
        <button
          type="button"
          onClick={() => openWith("menu")}
          aria-label={`More actions for ${card.name}`}
          className={`inline-flex items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-stone-900 ${moreButtonLayout}`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="19" cy="12" r="1.75" />
          </svg>
          <span className={layout === "card" ? "hidden sm:inline" : ""}>More</span>
        </button>
      )}

      {open && (
        <DialogContent title={title} description={`${card.name} · ${card.problem}`}>
          {current ? (
            <div className="space-y-4">
              {more.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode("menu")}
                  className="-mt-2 text-sm font-medium text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline"
                >
                  ← All actions
                </button>
              )}
              {/* Keyed so switching actions starts each form fresh. */}
              <ActionForm key={current.kind} kind={current.kind} card={card} onDone={finished} />
            </div>
          ) : (
            <ActionMenu card={card} onPick={setMode} />
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

function ActionMenu({ card, onPick }: { card: ActionTarget; onPick: (kind: ActionKind) => void }) {
  return (
    <ul className="space-y-2">
      {card.actions.more.map((action) => (
        <li key={action.kind}>
          <button
            type="button"
            onClick={() => onPick(action.kind)}
            className={`flex min-h-12 w-full items-center rounded-lg border px-4 py-3 text-left text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${
              action.kind === "lost"
                ? "mt-4 border-red-200 text-red-800 hover:bg-red-50"
                : "border-stone-300 text-stone-900 hover:bg-stone-50"
            }`}
          >
            {action.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
