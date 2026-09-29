import { subMinutes } from "date-fns";
import { BUSINESS_TIMEZONE } from "../lib/config";
import { addBusinessDays, isBusinessDay, localToday, zonedDateTime } from "../lib/dates";
import type {
  ActivityMeta,
  ActivityType,
  JobSource,
  JobStatus,
  LocalDate,
  LostReason,
} from "../lib/domain";

/**
 * Demo data for Denise's refrigeration business: 4 technicians, 20 customers
 * and 24 jobs, each with a timeline that explains how it got to where it is.
 *
 * Seeded "today", the list reads like Denise's own sentence:
 *
 *   New — nobody's called back yet ....... 2  (an emergency voicemail + a website form)
 *   Said yes — needs scheduling .......... 1
 *   You said you'd call today ............ 2  (one due today, one overdue)
 *   Waiting on a quote from us ........... 3
 *   Hasn't heard from us in 2+ days ...... 1
 *   Check on visits ...................... 1
 *
 * Five more open jobs are deliberately NOT on Today (quote sent yesterday,
 * callbacks set for later, visits coming up), and nine are closed.
 *
 * DATES: everything is relative to the seed time, counted in business days
 * back from the most recent business day (today on weekdays, Friday at the
 * weekend). That keeps every job in the same Today section whichever day the
 * seed runs. Only brand-new requests use "minutes ago", so nothing is ever
 * dated in the future.
 *
 * TIMELINES follow the convention the app's actions will use: one activity
 * per thing Denise did, carrying any status change in `meta`. Each job's
 * fields (status, callback, visit, quote) must match its own timeline;
 * seed-data.test.ts replays every timeline to check.
 */

export type SeedTechnician = { key: string; name: string; phone: string };

export type SeedCustomer = {
  key: string;
  name?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type SeedActivity = {
  type: ActivityType;
  at: Date;
  note?: string;
  meta?: ActivityMeta;
};

export type SeedJob = {
  customer: string;
  description: string;
  equipment?: string;
  source: JobSource;
  referredBy?: string;
  status: JobStatus;
  isEmergency?: boolean;
  quoteAmountCents?: number;
  technician?: string;
  scheduledFor?: LocalDate;
  followUpOn?: LocalDate;
  receivedAt: Date;
  closedAt?: Date;
  lostReason?: LostReason;
  /** Timeline, oldest first. `lastContactAt` and `quoteSentAt` are derived from it. */
  activities: SeedActivity[];
};

export type SeedData = {
  technicians: SeedTechnician[];
  customers: SeedCustomer[];
  jobs: SeedJob[];
};

const TECHNICIANS = {
  mike: { name: "Mike Dawson", phone: "(512) 555-0101" },
  carlos: { name: "Carlos Rivera", phone: "(512) 555-0102" },
  tasha: { name: "Tasha Greene", phone: "(512) 555-0103" },
  dave: { name: "Dave Lindqvist", phone: "(512) 555-0104" },
} as const;
type TechnicianKey = keyof typeof TECHNICIANS;

const CUSTOMERS: SeedCustomer[] = [
  {
    key: "rosas",
    name: "Rosa Martinez",
    businessName: "Rosa's Taqueria",
    phone: "(512) 555-0143",
    address: "1810 E Cesar Chavez St",
    notes: "Back door is off the alley. Kitchen opens at 6 am.",
  },
  {
    key: "bluebonnet",
    name: "Hannah Cho",
    businessName: "Bluebonnet Florist",
    phone: "(512) 555-0118",
    email: "hannah@bluebonnetflorist.example",
    address: "3301 Guadalupe St",
  },
  {
    key: "tallpines",
    name: "Jess Okafor",
    businessName: "Tall Pines Brewing",
    phone: "(512) 555-0162",
    address: "912 Industrial Blvd, Unit C",
    notes: "Loading dock around back. Ask for Jess or the brewer on shift.",
  },
  {
    key: "eastside",
    name: "Tony Nguyen",
    businessName: "Eastside Market",
    phone: "(512) 555-0127",
    address: "2117 E 7th St",
  },
  {
    key: "casaverde",
    name: "Miguel Soto",
    businessName: "Casa Verde Cantina",
    phone: "(512) 555-0134",
    address: "405 W 2nd St",
    notes: "Miguel prefers texts during service.",
  },
  {
    key: "sunrise",
    name: "Earl Whitaker",
    businessName: "Sunrise Diner",
    phone: "(512) 555-0112",
    address: "7800 N Lamar Blvd",
    notes: "Long-time customer. Earl prefers calls before 10 am or after 2 pm.",
  },
  {
    key: "harbor",
    name: "Glen Pruitt",
    businessName: "Harbor Lane Grocery",
    phone: "(512) 555-0151",
    email: "glen@harborlanegrocery.example",
    address: "4402 Harbor Ln",
  },
  {
    key: "hillcrest",
    name: "Pat Delgado",
    businessName: "Hillcrest Elementary (cafeteria)",
    phone: "(512) 555-0176",
    email: "pdelgado@hillcrestisd.example",
    address: "1200 Hillcrest Dr",
    notes: "Check in at the front office. Kitchen staff leave at 1:30 pm. District needs a PO before work.",
  },
  {
    key: "smoketimber",
    name: "Dale Hutchins",
    businessName: "Smoke & Timber BBQ",
    phone: "(512) 555-0189",
    address: "6500 Burnet Rd",
  },
  {
    key: "scoops",
    name: "Priya Nair",
    businessName: "Scoops & Co. Ice Cream",
    phone: "(512) 555-0145",
    address: "1515 S 1st St",
  },
  {
    key: "riverside",
    name: "Luis Ortega",
    businessName: "Riverside Bistro",
    phone: "(512) 555-0158",
    address: "220 Riverside Dr",
  },
  {
    key: "cornerpantry",
    name: "Amir",
    businessName: "Corner Pantry",
    phone: "(512) 555-0193",
    address: "3900 Manor Rd",
  },
  {
    key: "magnolia",
    name: "Sarah Kim",
    businessName: "Magnolia Bakehouse",
    phone: "(512) 555-0121",
    email: "sarah@magnoliabakehouse.example",
    address: "1100 E 11th St",
  },
  {
    key: "oakember",
    name: "Marcus Bell",
    businessName: "Oak & Ember Grill",
    phone: "(512) 555-0137",
    address: "5212 Airport Blvd",
  },
  {
    key: "lotus",
    name: "Kevin Tran",
    businessName: "Lotus Noodle House",
    phone: "(512) 555-0166",
    address: "8820 Research Blvd",
    notes: "Deliveries use the side door. Kevin's cell is best.",
  },
  {
    key: "parkside",
    name: "Dana Reyes",
    businessName: "Parkside Coffee Co.",
    phone: "(512) 555-0129",
    address: "600 Park Blvd",
  },
  {
    key: "lakeview",
    name: "Tom Becker",
    businessName: "Lakeview Inn",
    phone: "(512) 555-0172",
    email: "kitchen@lakeviewinn.example",
    address: "1 Lakeview Terrace",
    notes: "Tom is the kitchen manager. Banquet kitchen is on the lower level.",
  },
  {
    key: "cloudnine",
    name: "Brianna Lee",
    businessName: "Cloud Nine Frozen Yogurt",
    phone: "(512) 555-0184",
    address: "10000 Research Blvd",
  },
  {
    key: "stannes",
    name: "Linda Morales",
    businessName: "St. Anne's Parish Hall",
    phone: "(512) 555-0115",
    address: "3400 Duval St",
    notes: "Linda volunteers in the kitchen on Tuesdays and Thursdays.",
  },
  {
    key: "ramirez",
    name: "Hector Ramirez",
    businessName: "Ramirez Meat Market",
    phone: "(512) 555-0197",
    address: "5700 S Congress Ave",
  },
];

export function buildSeedData(now: Date): SeedData {
  const tz = BUSINESS_TIMEZONE;
  const today = localToday(now, tz);
  const lastBusinessDay = isBusinessDay(today) ? today : addBusinessDays(today, -1);

  /** The business day `n` business days before today (n ≥ 1, so always in the past). */
  const ago = (n: number): LocalDate => {
    if (n < 1) throw new Error("Use minutesAgo() for today so nothing is dated in the future.");
    return addBusinessDays(lastBusinessDay, -n);
  };
  /** The business day `n` business days from now (n ≥ 1, so always in the future). */
  const ahead = (n: number): LocalDate => {
    if (n < 1) throw new Error("ahead() needs n ≥ 1.");
    return addBusinessDays(lastBusinessDay, n);
  };
  /** A wall-clock time on one of Denise's days. */
  const on = (date: LocalDate, time: string): Date => zonedDateTime(date, time, tz);
  const minutesAgo = (minutes: number): Date => subMinutes(now, minutes);

  const dollars = (amount: number) => amount * 100;
  const moved = (fromStatus: JobStatus, toStatus: JobStatus): ActivityMeta => ({ fromStatus, toStatus });
  const received = (at: Date, source: JobSource, note?: string): SeedActivity => ({
    type: "request_received",
    at,
    note,
    meta: { source },
  });
  const booked = (tech: TechnicianKey, date: LocalDate, fromStatus: JobStatus): ActivityMeta => ({
    technicianName: TECHNICIANS[tech].name,
    date,
    fromStatus,
    toStatus: "scheduled",
  });

  /** `receivedAt` is when the first activity (the request) came in; `closedAt` when it was closed. */
  const job = (spec: Omit<SeedJob, "receivedAt" | "closedAt">): SeedJob => {
    const [first] = spec.activities;
    if (first?.type !== "request_received") {
      throw new Error(`Seed job "${spec.description}" must start with request_received`);
    }
    const closing = spec.activities.findLast(
      (a) => a.meta?.toStatus === "done" || a.meta?.toStatus === "lost",
    );
    return { ...spec, receivedAt: first.at, closedAt: closing?.at };
  };

  const jobs: SeedJob[] = [
    // ─── TODAY · New — nobody's called back yet ───────────────────────────
    job({
      // Emergency: sorts first in its section.
      customer: "rosas",
      description: "Walk-in cooler at 48°F with a full delivery inside",
      equipment: "Walk-in cooler",
      source: "phone",
      status: "new",
      isEmergency: true,
      activities: [
        received(
          minutesAgo(35),
          "phone",
          "Voicemail: walk-in reading 48 since this morning, full meat delivery inside. Needs someone today.",
        ),
      ],
    }),
    job({
      customer: "bluebonnet",
      description: "Floral display cooler not holding 36°F, arrangements wilting",
      equipment: "Floral display cooler",
      source: "website",
      status: "new",
      activities: [
        received(
          on(ago(1), "19:42"),
          "website",
          'Website form: "Our flower cooler creeps up to 45 overnight. We have weddings this weekend. Can someone look this week?"',
        ),
      ],
    }),

    // ─── TODAY · Said yes — needs scheduling ──────────────────────────────
    job({
      customer: "tallpines",
      description: "Glycol chiller short-cycling",
      equipment: "Glycol chiller",
      source: "referral",
      referredBy: "Rosa at Rosa's Taqueria",
      status: "ready_to_schedule",
      quoteAmountCents: dollars(2450),
      activities: [
        received(on(ago(5), "09:20"), "referral", "Rosa at Rosa's Taqueria gave them our number."),
        {
          type: "call_talked",
          at: on(ago(5), "09:50"),
          note: "Chiller cycling every few minutes. Beer temps OK for now. Wants a price before we come out.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(4), "15:10"),
          note: "Low-pressure switch and refrigerant recharge.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(2450) },
        },
        {
          type: "customer_called",
          at: on(ago(1), "16:30"),
          note: "Jess said go ahead. Wants it done before their next release.",
          meta: moved("quote_sent", "ready_to_schedule"),
        },
      ],
    }),

    // ─── TODAY · You said you'd call today ────────────────────────────────
    job({
      // Callback due today.
      customer: "eastside",
      description: "Reach-in freezer door gaskets torn, frost building up",
      equipment: "Reach-in freezer",
      source: "phone",
      status: "quote_sent",
      quoteAmountCents: dollars(380),
      followUpOn: today,
      activities: [
        received(on(ago(8), "11:05"), "phone"),
        {
          type: "call_talked",
          at: on(ago(8), "11:15"),
          note: "Gaskets torn on both doors. Needs a price.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(7), "09:30"),
          note: "Two door gaskets, installed.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(380) },
        },
        {
          type: "call_talked",
          at: on(ago(3), "14:20"),
          note: "Tony is checking with the owner. Asked us to call back.",
          meta: { date: today },
        },
      ],
    }),
    job({
      // Callback overdue.
      customer: "casaverde",
      description: "Back-bar cooler warm, beer at 45°F",
      equipment: "Back-bar cooler",
      source: "text",
      status: "quote_sent",
      quoteAmountCents: dollars(1150),
      followUpOn: ago(2),
      activities: [
        received(on(ago(9), "17:50"), "text", "Text from Miguel: back-bar cooler not keeping beer cold, 45 degrees."),
        {
          type: "call_talked",
          at: on(ago(9), "18:05"),
          note: "Condenser coil is caked and the fan sounds rough. Sending a price.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(8), "10:40"),
          note: "Coil cleaning and condenser fan motor.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(1150) },
        },
        {
          type: "call_talked",
          at: on(ago(4), "15:00"),
          note: "Miguel wants to wait until after the weekend rush. Asked us to call back in a couple of days.",
          meta: { date: ago(2) },
        },
      ],
    }),

    // ─── TODAY · Waiting on a quote from us ───────────────────────────────
    job({
      // Repeat customer: three past jobs below.
      customer: "sunrise",
      description: "Ice machine making soft, cloudy ice: repair or replace?",
      equipment: "Ice machine",
      source: "repeat",
      status: "needs_quote",
      activities: [
        received(on(ago(2), "07:45"), "repeat", "Earl called the shop line."),
        {
          type: "call_talked",
          at: on(ago(2), "08:05"),
          note: "Machine is 11 years old. Wants a price to repair it and a price for a new one.",
          meta: moved("new", "needs_quote"),
        },
      ],
    }),
    job({
      customer: "harbor",
      description: "Two produce display case fans not running",
      equipment: "Produce display case",
      source: "email",
      status: "needs_quote",
      activities: [
        received(on(ago(3), "08:30"), "email", "Email from Glen: two fans out on the produce case, product sweating."),
        {
          type: "call_talked",
          at: on(ago(3), "10:10"),
          note: "Probably both evaporator fan motors. He needs a written price for the owner.",
          meta: moved("new", "needs_quote"),
        },
      ],
    }),
    job({
      customer: "hillcrest",
      description: "Cafeteria milk cooler running at 43°F",
      equipment: "Milk cooler",
      source: "email",
      status: "needs_quote",
      activities: [
        received(on(ago(1), "13:05"), "email", "Facilities request from Pat: milk cooler at 43°F."),
        {
          type: "email",
          at: on(ago(1), "13:40"),
          note: "Replied to Pat. The district needs a written quote before they can issue a PO.",
          meta: moved("new", "needs_quote"),
        },
      ],
    }),

    // ─── TODAY · Hasn't heard from us in 2+ days ──────────────────────────
    job({
      customer: "smoketimber",
      description: "Walk-in freezer compressor loud and tripping the breaker",
      equipment: "Walk-in freezer",
      source: "phone",
      status: "quote_sent",
      quoteAmountCents: dollars(3850),
      activities: [
        received(on(ago(6), "06:55"), "phone", "Dale called early. Freezer compressor banging and tripping the breaker."),
        {
          type: "call_talked",
          at: on(ago(6), "07:10"),
          note: "Sounds like the compressor is going. Tasha will stop by to confirm.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "note",
          at: on(ago(4), "16:30"),
          note: "Tasha confirmed the compressor is failing. Needs replacing.",
        },
        {
          type: "quote_sent",
          at: on(ago(2), "11:15"),
          note: "Compressor replacement, parts and labor.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(3850) },
        },
      ],
    }),

    // ─── TODAY · Check on visits — did this get done? ─────────────────────
    job({
      customer: "scoops",
      description: "Dipping cabinet not holding temp, ice cream going soft",
      equipment: "Dipping cabinet",
      source: "phone",
      status: "scheduled",
      technician: "dave",
      scheduledFor: ago(1),
      activities: [
        received(on(ago(4), "12:10"), "phone"),
        {
          type: "scheduled",
          at: on(ago(4), "12:25"),
          note: "Service call. Dave to check the dipping cabinet.",
          meta: booked("dave", ago(1), "new"),
        },
      ],
    }),

    // ─── NOT ON TODAY · open, but nothing to do yet ───────────────────────
    job({
      // Quote went out yesterday: too soon to chase.
      customer: "riverside",
      description: "Sandwich prep table warm on the left side",
      equipment: "Prep table",
      source: "phone",
      status: "quote_sent",
      quoteAmountCents: dollars(640),
      activities: [
        received(on(ago(3), "14:00"), "phone"),
        {
          type: "call_talked",
          at: on(ago(3), "14:10"),
          note: "Left side at 46°F, right side fine. Probably the evaporator fan.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(1), "09:50"),
          note: "Evaporator fan motor and cleaning.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(640) },
        },
      ],
    }),
    job({
      // Quiet long enough to chase, but Amir asked for a callback later this week.
      customer: "cornerpantry",
      description: "3-door beverage cooler compressor replacement",
      equipment: "Beverage cooler",
      source: "text",
      status: "quote_sent",
      quoteAmountCents: dollars(2900),
      followUpOn: ahead(2),
      activities: [
        received(on(ago(8), "16:40"), "text", "Text from Amir: drinks cooler warm again, third time this year."),
        {
          type: "call_talked",
          at: on(ago(8), "17:00"),
          note: "Compressor is worn out. He wants a price to replace it.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(6), "10:20"),
          note: "Compressor replacement.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(2900) },
        },
        {
          type: "call_talked",
          at: on(ago(2), "13:15"),
          note: "Amir is getting a second quote. Asked us to check back later this week.",
          meta: { date: ahead(2) },
        },
      ],
    }),
    job({
      // Needs a quote, but on hold until the landlord approves.
      customer: "magnolia",
      description: "Bakery display case: repair or replace, pending landlord approval",
      equipment: "Bakery display case",
      source: "referral",
      referredBy: "Dana at Parkside Coffee Co.",
      status: "needs_quote",
      followUpOn: ahead(4),
      activities: [
        received(on(ago(5), "10:30"), "referral", "Dana at Parkside Coffee passed along our number."),
        {
          type: "call_talked",
          at: on(ago(5), "10:45"),
          note: "Case is original to the building. Landlord has to approve any work.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "customer_called",
          at: on(ago(1), "15:20"),
          note: "Sarah is still waiting on the landlord. Call her back next week.",
          meta: { date: ahead(4) },
        },
      ],
    }),
    job({
      // Visit coming up: future visits never nag, however quiet.
      customer: "oakember",
      description: "Walk-in cooler door not sealing, ice on the floor",
      equipment: "Walk-in cooler",
      source: "phone",
      status: "scheduled",
      technician: "mike",
      scheduledFor: ahead(2),
      activities: [
        received(on(ago(2), "09:05"), "phone"),
        {
          type: "scheduled",
          at: on(ago(2), "09:20"),
          note: "Mike to replace the door closer and gasket.",
          meta: booked("mike", ahead(2), "new"),
        },
      ],
    }),
    job({
      // Repeat customer, visit booked for when the part arrives.
      customer: "lotus",
      description: "Walk-in freezer condenser fan motor replacement",
      equipment: "Walk-in freezer",
      source: "repeat",
      status: "scheduled",
      technician: "carlos",
      scheduledFor: ahead(5),
      quoteAmountCents: dollars(525),
      activities: [
        received(on(ago(9), "11:30"), "repeat", "Kevin called: freezer fan squealing."),
        {
          type: "call_talked",
          at: on(ago(9), "11:40"),
          note: "Condenser fan motor is on its way out. Sending a price.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(8), "14:00"),
          note: "Condenser fan motor, parts and labor.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(525) },
        },
        {
          type: "customer_called",
          at: on(ago(6), "10:15"),
          note: "Kevin approved.",
          meta: moved("quote_sent", "ready_to_schedule"),
        },
        {
          type: "scheduled",
          at: on(ago(6), "10:30"),
          note: "Motor is on backorder. Carlos booked for when it arrives.",
          meta: booked("carlos", ahead(5), "ready_to_schedule"),
        },
      ],
    }),

    // ─── CLOSED · done ────────────────────────────────────────────────────
    job({
      customer: "sunrise",
      description: "Walk-in cooler thermostat replaced",
      equipment: "Walk-in cooler",
      source: "phone",
      status: "done",
      technician: "mike",
      scheduledFor: ago(118),
      activities: [
        received(on(ago(120), "08:15"), "phone"),
        {
          type: "scheduled",
          at: on(ago(120), "08:30"),
          note: "Cooler drifting warm in the afternoons. Mike to check the controls.",
          meta: booked("mike", ago(118), "new"),
        },
        {
          type: "status_change",
          at: on(ago(118), "15:40"),
          note: "Mike replaced the thermostat. Holding 36°F.",
          meta: moved("scheduled", "done"),
        },
      ],
    }),
    job({
      customer: "sunrise",
      description: "Ice machine descaled and sanitized",
      equipment: "Ice machine",
      source: "repeat",
      status: "done",
      technician: "tasha",
      scheduledFor: ago(72),
      activities: [
        received(on(ago(75), "09:00"), "repeat"),
        {
          type: "scheduled",
          at: on(ago(75), "09:10"),
          note: "Routine descale.",
          meta: booked("tasha", ago(72), "new"),
        },
        {
          type: "status_change",
          at: on(ago(72), "13:20"),
          note: "Tasha descaled and sanitized. Told Earl the machine is getting old.",
          meta: moved("scheduled", "done"),
        },
      ],
    }),
    job({
      // A past emergency: closed jobs never appear, emergency or not.
      customer: "sunrise",
      description: "Reach-in freezer stopped overnight",
      equipment: "Reach-in freezer",
      source: "repeat",
      status: "done",
      isEmergency: true,
      technician: "carlos",
      scheduledFor: ago(31),
      activities: [
        received(
          on(ago(31), "06:20"),
          "repeat",
          "Earl: reach-in freezer dead this morning, moving food to the walk-in.",
        ),
        {
          type: "scheduled",
          at: on(ago(31), "06:30"),
          note: "Emergency. Carlos heading over now.",
          meta: booked("carlos", ago(31), "new"),
        },
        {
          type: "status_change",
          at: on(ago(31), "11:45"),
          note: "Carlos replaced the evaporator fan motor. Back to 0°F by lunch.",
          meta: moved("scheduled", "done"),
        },
      ],
    }),
    job({
      customer: "lotus",
      description: "Prep cooler door gaskets replaced",
      equipment: "Prep cooler",
      source: "phone",
      status: "done",
      technician: "dave",
      scheduledFor: ago(45),
      quoteAmountCents: dollars(410),
      activities: [
        received(on(ago(47), "10:00"), "phone"),
        {
          type: "call_talked",
          at: on(ago(47), "10:10"),
          note: "Needs gaskets on all four doors.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(47), "15:00"),
          note: "Four door gaskets, installed.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(410) },
        },
        {
          type: "customer_called",
          at: on(ago(46), "09:30"),
          note: "Kevin said go ahead.",
          meta: moved("quote_sent", "ready_to_schedule"),
        },
        {
          type: "scheduled",
          at: on(ago(46), "09:40"),
          meta: booked("dave", ago(45), "ready_to_schedule"),
        },
        {
          type: "status_change",
          at: on(ago(45), "14:10"),
          note: "Dave replaced all four gaskets.",
          meta: moved("scheduled", "done"),
        },
      ],
    }),
    job({
      customer: "parkside",
      description: "Under-counter milk fridge not cooling",
      equipment: "Under-counter fridge",
      source: "phone",
      status: "done",
      technician: "tasha",
      scheduledFor: ago(3),
      activities: [
        received(on(ago(5), "07:30"), "phone"),
        {
          type: "scheduled",
          at: on(ago(5), "07:45"),
          meta: booked("tasha", ago(3), "new"),
        },
        {
          type: "status_change",
          at: on(ago(3), "10:05"),
          note: "Tasha replaced the start relay. Fridge at 37°F.",
          meta: moved("scheduled", "done"),
        },
      ],
    }),
    job({
      customer: "stannes",
      description: "Donated reach-in refrigerator: check and recharge",
      equipment: "Reach-in refrigerator",
      source: "referral",
      referredBy: "Earl at Sunrise Diner",
      status: "done",
      technician: "dave",
      scheduledFor: ago(15),
      activities: [
        received(on(ago(18), "10:30"), "referral", "Earl from Sunrise Diner sent them our way."),
        {
          type: "scheduled",
          at: on(ago(18), "10:45"),
          meta: booked("dave", ago(15), "new"),
        },
        {
          type: "status_change",
          at: on(ago(15), "12:30"),
          note: "Dave fixed a leak at the service valve and recharged it.",
          meta: moved("scheduled", "done"),
        },
      ],
    }),

    // ─── CLOSED · didn't go ahead ─────────────────────────────────────────
    job({
      customer: "lakeview",
      description: "Banquet walk-in condensing unit replacement",
      equipment: "Walk-in cooler",
      source: "website",
      status: "lost",
      lostReason: "too_expensive",
      quoteAmountCents: dollars(6200),
      activities: [
        received(
          on(ago(16), "12:00"),
          "website",
          "Website form: banquet walk-in struggling to hold temp in the afternoons.",
        ),
        {
          type: "call_talked",
          at: on(ago(16), "13:30"),
          note: "Condensing unit is undersized and 20 years old. Needs replacing.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(14), "16:00"),
          note: "New condensing unit, installed.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(6200) },
        },
        {
          type: "customer_called",
          at: on(ago(10), "11:00"),
          note: "Tom said the budget isn't there this year. Maybe next spring.",
          meta: { ...moved("quote_sent", "lost"), lostReason: "too_expensive" },
        },
      ],
    }),
    job({
      // Shows the "no answer" attempts in a timeline.
      customer: "cloudnine",
      description: "Frozen yogurt machine not freezing",
      equipment: "Soft-serve machine",
      source: "website",
      status: "lost",
      lostReason: "no_response",
      quoteAmountCents: dollars(890),
      activities: [
        received(on(ago(20), "15:00"), "website"),
        {
          type: "call_talked",
          at: on(ago(20), "16:10"),
          note: "Machine runs but won't freeze. Likely the compressor start components.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "quote_sent",
          at: on(ago(19), "11:00"),
          note: "Start capacitor, relay and a full check.",
          meta: { ...moved("needs_quote", "quote_sent"), quoteAmountCents: dollars(890) },
        },
        { type: "no_answer", at: on(ago(16), "10:00") },
        { type: "voicemail", at: on(ago(15), "10:05"), note: "Left a message about the quote." },
        { type: "no_answer", at: on(ago(12), "14:30") },
        {
          type: "status_change",
          at: on(ago(10), "09:00"),
          note: "Three tries, no reply. Closing it out.",
          meta: { ...moved("quote_sent", "lost"), lostReason: "no_response" },
        },
      ],
    }),
    job({
      customer: "ramirez",
      description: "Meat display case icing over",
      equipment: "Meat display case",
      source: "phone",
      status: "lost",
      lostReason: "fixed_themselves",
      activities: [
        received(on(ago(7), "08:40"), "phone"),
        {
          type: "call_talked",
          at: on(ago(7), "08:50"),
          note: "Case ices up every afternoon. Sounds like the defrost timer.",
          meta: moved("new", "needs_quote"),
        },
        {
          type: "customer_called",
          at: on(ago(6), "12:15"),
          note: "Hector's nephew swapped the defrost timer. Working fine now.",
          meta: { ...moved("needs_quote", "lost"), lostReason: "fixed_themselves" },
        },
      ],
    }),
  ];

  return {
    technicians: Object.entries(TECHNICIANS).map(([key, t]) => ({ key, ...t })),
    customers: CUSTOMERS,
    // Oldest request first, so job numbers rise with time like a real job book.
    jobs: jobs.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()),
  };
}
