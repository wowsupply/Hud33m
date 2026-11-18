import { comments, meals, mentorAssignments, users, weightEntries } from '@hud/db';
import { MEAL_TYPE_LABELS, formatDateRu, formatWeekRu, isDateStr, type CommentTarget } from '@hud/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Deps } from '../deps';
import { notify } from './notifications';

export interface CommentView {
  id: string;
  targetType: CommentTarget;
  targetId: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  author: { id: string | null; name: string; isStaff: boolean };
}

/** Человекочитаемое описание объекта комментария и ссылка на него в приложении ученицы. */
export async function describeTarget(
  deps: Deps,
  studentId: string,
  targetType: CommentTarget,
  targetId: string,
): Promise<{ title: string; date: string | null; link: string }> {
  if (targetType === 'meal') {
    const [m] = await deps.db
      .select({ mealType: meals.mealType, diaryDate: meals.diaryDate, localTime: meals.localTime })
      .from(meals)
      .where(and(eq(meals.id, targetId), eq(meals.userId, studentId)));
    if (!m) throw new TRPCError({ code: 'NOT_FOUND', message: 'Приём пищи не найден' });
    return {
      title: `${MEAL_TYPE_LABELS[m.mealType]}, ${formatDateRu(m.diaryDate)}`,
      date: m.diaryDate,
      link: `/day/${m.diaryDate}?meal=${targetId}`,
    };
  }
  if (targetType === 'weight') {
    const [w] = await deps.db
      .select({ diaryDate: weightEntries.diaryDate })
      .from(weightEntries)
      .where(and(eq(weightEntries.id, targetId), eq(weightEntries.userId, studentId)));
    if (!w) throw new TRPCError({ code: 'NOT_FOUND', message: 'Взвешивание не найдено' });
    return { title: `Вес, ${formatDateRu(w.diaryDate)}`, date: w.diaryDate, link: '/weight' };
  }
  if (!isDateStr(targetId)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверная дата' });
  if (targetType === 'day') {
    return { title: `День, ${formatDateRu(targetId)}`, date: targetId, link: `/day/${targetId}` };
  }
  return { title: `Неделя ${formatWeekRu(targetId)}`, date: targetId, link: `/reports/${targetId}` };
}

export async function createComment(
  deps: Deps,
  input: {
    studentId: string;
    author: { id: string; role: string; firstName: string };
    targetType: CommentTarget;
    targetId: string;
    parentId: string | null;
    body: string;
  },
): Promise<string> {
  let { targetType, targetId } = input;
  if (input.parentId) {
    const [parent] = await deps.db
      .select()
      .from(comments)
      .where(and(eq(comments.id, input.parentId), eq(comments.studentId, input.studentId)));
    if (!parent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Комментарий не найден' });
    targetType = parent.targetType;
    targetId = parent.targetId;
  }
  const target = await describeTarget(deps, input.studentId, targetType, targetId);

  const [row] = await deps.db
    .insert(comments)
    .values({
      studentId: input.studentId,
      authorId: input.author.id,
      targetType,
      targetId,
      parentId: input.parentId,
      body: input.body.trim(),
    })
    .returning({ id: comments.id });

  const isStaff = input.author.role !== 'student';
  if (isStaff) {
    await notify(deps.db, {
      userId: input.studentId,
      type: 'mentor_comment',
      title: 'Новый комментарий наставника',
      body: `${target.title}: ${input.body.trim().slice(0, 140)}`,
      link: target.link,
    });
  } else {
    const mentors = await deps.db
      .select({ mentorId: mentorAssignments.mentorId })
      .from(mentorAssignments)
      .where(eq(mentorAssignments.studentId, input.studentId));
    for (const m of mentors) {
      await notify(deps.db, {
        userId: m.mentorId,
        type: 'student_reply',
        title: `Ответ от ${input.author.firstName}`,
        body: `${target.title}: ${input.body.trim().slice(0, 140)}`,
        link: `/students/${input.studentId}`,
      });
    }
  }
  return row!.id;
}

export async function listComments(
  deps: Deps,
  studentId: string,
  filter?: { targetType: CommentTarget; targetId: string },
): Promise<CommentView[]> {
  const rows = await deps.db
    .select({ c: comments, author: { id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role } })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(
      and(
        eq(comments.studentId, studentId),
        filter ? eq(comments.targetType, filter.targetType) : undefined,
        filter ? eq(comments.targetId, filter.targetId) : undefined,
      ),
    )
    .orderBy(asc(comments.createdAt));
  return rows.map(({ c, author }) => ({
    id: c.id,
    targetType: c.targetType,
    targetId: c.targetId,
    parentId: c.parentId,
    body: c.body,
    createdAt: c.createdAt,
    readAt: c.readAt,
    author: {
      id: author?.id ?? null,
      name: author ? `${author.firstName} ${author.lastName}`.trim() : 'Удалённый пользователь',
      isStaff: !!author && author.role !== 'student',
    },
  }));
}

export interface ThreadView {
  targetType: CommentTarget;
  targetId: string;
  title: string;
  link: string;
  date: string | null;
  comments: CommentView[];
  unread: number;
  lastAt: Date;
}

/** Комментарии, сгруппированные по объектам («ветки»), новые сверху. */
export async function listThreads(deps: Deps, studentId: string, viewer: 'student' | 'staff'): Promise<ThreadView[]> {
  const all = await listComments(deps, studentId);
  const groups = new Map<string, CommentView[]>();
  for (const c of all) {
    const key = `${c.targetType}:${c.targetId}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const threads: ThreadView[] = [];
  for (const list of groups.values()) {
    const first = list[0]!;
    let target: { title: string; date: string | null; link: string };
    try {
      target = await describeTarget(deps, studentId, first.targetType, first.targetId);
    } catch {
      target = { title: 'Удалённая запись', date: null, link: '/' };
    }
    threads.push({
      targetType: first.targetType,
      targetId: first.targetId,
      ...target,
      comments: list,
      unread: list.filter((c) => !c.readAt && (viewer === 'student' ? c.author.isStaff : !c.author.isStaff)).length,
      lastAt: list[list.length - 1]!.createdAt,
    });
  }
  return threads.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

/** Отмечает прочитанными комментарии второй стороны. */
export async function markCommentsRead(
  deps: Deps,
  studentId: string,
  viewer: 'student' | 'staff',
  ids?: string[],
): Promise<void> {
  const candidates = await listComments(deps, studentId);
  const toMark = candidates
    .filter((c) => !c.readAt && (viewer === 'student' ? c.author.isStaff : !c.author.isStaff))
    .filter((c) => !ids || ids.includes(c.id))
    .map((c) => c.id);
  if (toMark.length === 0) return;
  await deps.db.update(comments).set({ readAt: deps.now() }).where(inArray(comments.id, toMark));
}

export async function unreadFromStaffCount(deps: Deps, studentId: string): Promise<number> {
  const rows = await deps.db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.studentId, studentId), isNull(comments.readAt), ne(comments.authorId, studentId)));
  return rows.length;
}
