"use client";

import { createContext, useContext } from "react";
import type { CallbackChoice } from "@/lib/callback-choices";
import type { LocalDate } from "@/lib/domain";

type ActionFormsShared = {
  today: LocalDate;
  technicians: { id: number; name: string }[];
  callbackChoices: CallbackChoice[];
};

const ActionFormsContext = createContext<ActionFormsShared | null>(null);

export function useActionForms(): ActionFormsShared {
  const value = useContext(ActionFormsContext);
  if (!value) throw new Error("useActionForms must be used inside <ActionFormsProvider>");
  return value;
}

/**
 * Data the action forms share (today's date, technicians, callback dates),
 * computed once on the server. Used by Today and by Job Detail.
 */
export function ActionFormsProvider({ children, ...shared }: ActionFormsShared & { children: React.ReactNode }) {
  return <ActionFormsContext.Provider value={shared}>{children}</ActionFormsContext.Provider>;
}
