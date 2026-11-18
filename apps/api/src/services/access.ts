import { enrollments, programs } from '@hud/db';
import { daysBetween, localDate, type EnrollmentStatus } from '@hud/shared';
import { desc, eq } from 'drizzle-orm';
import type { Deps } from '../deps';

export type AccessStatus = 'active' | 'not_started' | 'paused' | 'ended' | 'none';

export interface AccessState {
  status: AccessStatus;
  canRead: boolean;
  canWrite: boolean;
  enrollmentId: string | null;
  programName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  daysLeft: number | null;
}

export interface EnrollmentLike {
  id: string;
  status: EnrollmentStatus;
  startsOn: string;
  endsOn: string;
  programName: string | null;
}

export function computeAccess(
  e: EnrollmentLike | null,
  today: string,
  afterEnd: 'read_only' | 'blocked',
): AccessState {
  if (!e) {
    return {
      status: 'none',
      canRead: false,
      canWrite: false,
      enrollmentId: null,
      programName: null,
      startsOn: null,
      endsOn: null,
      daysLeft: null,
    };
  }
  const base = { enrollmentId: e.id, programName: e.programName, startsOn: e.startsOn, endsOn: e.endsOn };
  const readAfterEnd = afterEnd === 'read_only';
  if (e.status === 'closed' || e.status === 'expired' || e.endsOn < today) {
    return { ...base, status: 'ended', canRead: readAfterEnd, canWrite: false, daysLeft: 0 };
  }
  if (e.status === 'paused') {
    return { ...base, status: 'paused', canRead: true, canWrite: false, daysLeft: daysBetween(today, e.endsOn) };
  }
  if (e.startsOn > today) {
    return { ...base, status: 'not_started', canRead: true, canWrite: false, daysLeft: daysBetween(today, e.endsOn) };
  }
  return { ...base, status: 'active', canRead: true, canWrite: true, daysLeft: daysBetween(today, e.endsOn) };
}

export async function currentEnrollment(deps: Deps, userId: string): Promise<EnrollmentLike | null> {
  const [row] = await deps.db
    .select({
      id: enrollments.id,
      status: enrollments.status,
      startsOn: enrollments.startsOn,
      endsOn: enrollments.endsOn,
      programName: programs.name,
    })
    .from(enrollments)
    .leftJoin(programs, eq(programs.id, enrollments.programId))
    .where(eq(enrollments.userId, userId))
    .orderBy(desc(enrollments.endsOn), desc(enrollments.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getAccessState(deps: Deps, user: { id: string; timezone: string }): Promise<AccessState> {
  const today = localDate(deps.now(), user.timezone);
  return computeAccess(await currentEnrollment(deps, user.id), today, deps.config.ACCESS_AFTER_END);
}
