"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { createRequest } from "@/db/mutations/create-request";
import { findCustomerByPhone } from "@/db/queries/customers";
import { parseNewRequestInput, type Fields } from "@/lib/action-inputs";
import type { ActionState } from "@/lib/action-state";
import { BUSINESS_TIMEZONE } from "@/lib/config";
import { localToday } from "@/lib/dates";
import { describeRepeatCustomer, type RepeatCustomerView } from "@/lib/new-request";
import { phoneDigits } from "@/lib/phone";
import { isSignedIn, SIGNED_OUT } from "@/lib/session";

/**
 * Server Actions for "+ New request": a phone lookup while Denise types, and
 * saving the request.
 */

const TZ = BUSINESS_TIMEZONE;
const MIN_LOOKUP_DIGITS = 7;

/** Is this number already a customer? Read-only; returns what the form should show. */
export async function lookupCustomerAction(phone: string): Promise<RepeatCustomerView | null> {
  // Would reveal who is a customer, so it needs a session like everything else.
  if (!(await isSignedIn())) return null;
  const digits = phoneDigits(typeof phone === "string" ? phone : "");
  if (!digits || digits.length < MIN_LOOKUP_DIGITS) return null;
  const match = await findCustomerByPhone(db, digits);
  return match ? describeRepeatCustomer(match) : null;
}

export async function createRequestAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const fields: Fields = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") fields[key] = value;
  }

  const parsed = parseNewRequestInput(fields, localToday(now, TZ));
  if (!parsed.ok) {
    return { status: "error", message: parsed.errors.form ?? null, fieldErrors: parsed.errors };
  }

  let created;
  try {
    created = await createRequest(db, parsed.value, now, TZ);
  } catch (error) {
    // The transaction rolled back, so it's safe to say nothing was saved.
    console.error("New request failed", error);
    return { status: "error", message: "That didn't save. Nothing was changed. Try again.", fieldErrors: {} };
  }

  // Every page shows job data (Today, Jobs, Job Detail), so refresh them all.
  revalidatePath("/", "layout");
  return { status: "success", message: `${created.displayName}: ${created.summary}` };
}
