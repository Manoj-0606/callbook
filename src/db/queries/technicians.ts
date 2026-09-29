import { and, asc, eq } from "drizzle-orm";
import type { Executor } from "../executor";
import { technicians } from "../schema";

export type TechnicianOption = { id: number; name: string };

export async function listActiveTechnicians(db: Executor): Promise<TechnicianOption[]> {
  return db
    .select({ id: technicians.id, name: technicians.name })
    .from(technicians)
    .where(eq(technicians.active, true))
    .orderBy(asc(technicians.name));
}

export async function findActiveTechnician(db: Executor, id: number): Promise<TechnicianOption | null> {
  const [technician] = await db
    .select({ id: technicians.id, name: technicians.name })
    .from(technicians)
    .where(and(eq(technicians.id, id), eq(technicians.active, true)));
  return technician ?? null;
}
