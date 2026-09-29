import { parseNewRequestInput, type Fields, type NewRequestMessages, type Parsed } from "./action-inputs";
import type { LocalDate } from "./domain";
import type { NewRequestInput } from "./new-request";

/**
 * The public "Request service" form on the company website. It feeds the same
 * new-request path as Denise's quick add; this only decides what a member of
 * the public is allowed to send, and how to word problems for them.
 */

/** The only thing a submitter ever sees after sending, matched customer or not. */
export const PUBLIC_THANK_YOU = "Thanks — we've received your request.";

/**
 * A field hidden from people (off-screen, skipped by keyboard and screen
 * readers) that spam bots fill in. Anything in it means the submission is dropped.
 */
export const HONEYPOT_FIELD = "website";

export function isHoneypotFilled(fields: Fields): boolean {
  return (fields[HONEYPOT_FIELD] ?? "").trim().length > 0;
}

const PUBLIC_MESSAGES: NewRequestMessages = {
  nameRequired: "Please enter your name or your business name.",
  phoneRequired: "Please enter a phone number so we can call you back.",
  phoneInvalid: "Please check the phone number.",
  descriptionRequired: "Please tell us what's wrong.",
  descriptionTooLong: "Please keep this under 500 characters.",
  emailInvalid: "Please check the email address.",
  tooLong: (max) => `Please keep this under ${max} characters.`,
};

/**
 * Only the seven public fields are read. The source is always "website", and
 * internal-only fields (callback dates, referrals, notes, a different source)
 * are ignored even if someone adds them to the request by hand.
 */
export function parsePublicRequestInput(fields: Fields, today: LocalDate): Parsed<NewRequestInput> {
  const parsed = parseNewRequestInput(
    {
      name: fields.name,
      businessName: fields.businessName,
      phone: fields.phone,
      email: fields.email,
      address: fields.address,
      description: fields.description,
      isEmergency: fields.isEmergency,
      source: "website",
    },
    today,
    PUBLIC_MESSAGES,
  );
  if (parsed.ok) return parsed;

  // The public form asks for Name first, so show "enter your name" there.
  const { businessName, ...rest } = parsed.errors;
  return {
    ok: false,
    errors:
      businessName === PUBLIC_MESSAGES.nameRequired ? { ...rest, name: businessName } : parsed.errors,
  };
}
