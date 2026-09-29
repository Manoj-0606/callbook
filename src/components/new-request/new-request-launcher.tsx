import { connection } from "next/server";
import { callbackChoices } from "@/lib/callback-choices";
import { BUSINESS_TIMEZONE } from "@/lib/config";
import { localToday } from "@/lib/dates";
import { NewRequestButton } from "./new-request-button";

/** Works out Denise's "today" on the server so the form's callback dates are right. */
export async function NewRequestLauncher() {
  await connection();
  const today = localToday(new Date(), BUSINESS_TIMEZONE);
  return <NewRequestButton today={today} callbackChoices={callbackChoices(today)} />;
}
