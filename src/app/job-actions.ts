"use server";

import { revalidatePath } from "next/cache";
import { db, type Job } from "@/db";
import { applyJobAction } from "@/db/mutations/apply-job-action";
import { findActiveTechnician } from "@/db/queries/technicians";
import {
  parseCallbackInput,
  parseDoneInput,
  parseLogCallInput,
  parseLostInput,
  parseNoteInput,
  parseQuoteInput,
  parseScheduleInput,
  type FieldErrors,
  type Fields,
} from "@/lib/action-inputs";
import type { ActionState } from "@/lib/action-state";
import { BUSINESS_TIMEZONE } from "@/lib/config";
import { localToday } from "@/lib/dates";
import { isSignedIn, SIGNED_OUT } from "@/lib/session";
import {
  planCallback,
  planDone,
  planLogCall,
  planLost,
  planNote,
  planQuoteSent,
  planSchedule,
  type ChangeResult,
} from "@/lib/job-actions";

/**
 * Server Actions behind the Today cards. Each one validates the form, lets a
 * pure plan decide the changes, applies them in one transaction, then
 * refreshes Today so the card moves or disappears. Each one checks the
 * session first: nothing is read or changed for someone who isn't signed in.
 */

const TZ = BUSINESS_TIMEZONE;

export async function logCallAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const parsed = parseLogCallInput(fieldsOf(formData), localToday(now, TZ));
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId, ...input } = parsed.value;
  return apply(jobId, (job) => planLogCall(job, input, now, TZ));
}

export async function markQuoteSentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const parsed = parseQuoteInput(fieldsOf(formData));
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId, ...input } = parsed.value;
  return apply(jobId, (job) => planQuoteSent(job, input, now, TZ));
}

export async function scheduleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const parsed = parseScheduleInput(fieldsOf(formData), localToday(now, TZ));
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId, technicianId, visitOn, note } = parsed.value;

  const technician = await findActiveTechnician(db, technicianId);
  if (!technician) return invalid({ technicianId: "Pick a technician." });

  return apply(jobId, (job) => planSchedule(job, { technician, visitOn, note }, now, TZ));
}

export async function setCallbackAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const parsed = parseCallbackInput(fieldsOf(formData), localToday(now, TZ));
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId, ...input } = parsed.value;
  return apply(jobId, (job) => planCallback(job, input, now, TZ));
}

export async function markDoneAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const parsed = parseDoneInput(fieldsOf(formData));
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId, ...input } = parsed.value;
  return apply(jobId, (job) => planDone(job, input, now));
}

export async function markLostAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const parsed = parseLostInput(fieldsOf(formData));
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId, ...input } = parsed.value;
  return apply(jobId, (job) => planLost(job, input, now));
}

export async function addNoteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSignedIn())) return SIGNED_OUT;
  const now = new Date();
  const parsed = parseNoteInput(fieldsOf(formData));
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId, ...input } = parsed.value;
  return apply(jobId, (job) => planNote(job, input, now));
}

async function apply(jobId: number, plan: (job: Job) => ChangeResult): Promise<ActionState> {
  let result;
  try {
    result = await applyJobAction(db, jobId, plan);
  } catch (error) {
    // The transaction rolled back, so it's safe to say nothing changed.
    console.error("Job action failed", error);
    return { status: "error", message: "That didn't save. Nothing was changed. Try again.", fieldErrors: {} };
  }

  if (!result.ok) {
    return result.field
      ? { status: "error", message: null, fieldErrors: { [result.field]: result.error } }
      : { status: "error", message: result.error, fieldErrors: {} };
  }

  // Every page shows job data (Today, Jobs, Job Detail), so refresh them all.
  revalidatePath("/", "layout");
  return { status: "success", message: result.summary };
}

function invalid(errors: FieldErrors): ActionState {
  return { status: "error", message: errors.form ?? null, fieldErrors: errors };
}

function fieldsOf(formData: FormData): Fields {
  const fields: Fields = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}
