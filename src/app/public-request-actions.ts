"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { createRequest } from "@/db/mutations/create-request";
import type { Fields } from "@/lib/action-inputs";
import type { ActionState } from "@/lib/action-state";
import { BUSINESS_PHONE, BUSINESS_TIMEZONE } from "@/lib/config";
import { localToday } from "@/lib/dates";
import { isHoneypotFilled, parsePublicRequestInput, PUBLIC_THANK_YOU } from "@/lib/public-request";

/**
 * The public "Request service" form. It saves through the same path as
 * Denise's quick add (validation → plan → one transaction), with the source
 * fixed as "website".
 *
 * Whatever happens inside (new customer or repeat customer), the submitter
 * gets the same fixed thank-you. Nothing about existing customers or jobs
 * ever comes back.
 */
export async function submitServiceRequestAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const fields: Fields = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") fields[key] = value;
  }

  // A bot filled the hidden field: look successful, save nothing.
  if (isHoneypotFilled(fields)) return { status: "success", message: PUBLIC_THANK_YOU };

  const now = new Date();
  const parsed = parsePublicRequestInput(fields, localToday(now, BUSINESS_TIMEZONE));
  if (!parsed.ok) return { status: "error", message: null, fieldErrors: parsed.errors };

  try {
    // A stranger can type anyone's number, so an existing record is never changed from here.
    await createRequest(db, parsed.value, now, BUSINESS_TIMEZONE, { updateExistingCustomer: false });
  } catch (error) {
    console.error("Public service request failed", error);
    return {
      status: "error",
      message: `Sorry, your request didn't go through. Please try again, or call us at ${BUSINESS_PHONE}.`,
      fieldErrors: {},
    };
  }

  // Denise's pages (Today, Jobs) show the new request straight away.
  revalidatePath("/", "layout");
  return { status: "success", message: PUBLIC_THANK_YOU };
}
