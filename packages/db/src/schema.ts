import {
  ACTIVITY_LEVELS,
  COMMENT_TARGETS,
  CONSENT_TYPES,
  DICTIONARY_KINDS,
  ENROLLMENT_STATUSES,
  INPUT_METHODS,
  MEAL_TYPES,
  NOTIFICATION_TYPES,
  PROGRAM_KINDS,
  ROLES,
  SEXES,
  VALUE_SOURCES,
  type DayFacts,
  type WeekFacts,
} from '@hud/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Перечисления
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum('role', ROLES);
export const sexEnum = pgEnum('sex', SEXES);
export const activityLevelEnum = pgEnum('activity_level', ACTIVITY_LEVELS);
export const enrollmentStatusEnum = pgEnum('enrollment_status', ENROLLMENT_STATUSES);
export const programKindEnum = pgEnum('program_kind', PROGRAM_KINDS);
export const mealTypeEnum = pgEnum('meal_type', MEAL_TYPES);
export const inputMethodEnum = pgEnum('input_method', INPUT_METHODS);
export const valueSourceEnum = pgEnum('value_source', VALUE_SOURCES);
export const dictionaryKindEnum = pgEnum('dictionary_kind', DICTIONARY_KINDS);
export const commentTargetEnum = pgEnum('comment_target', COMMENT_TARGETS);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const consentTypeEnum = pgEnum('consent_type', CONSENT_TYPES);
export const targetSourceEnum = pgEnum('target_source', ['auto', 'mentor']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const emptyTextArray = sql`'{}'::text[]`;

// ---------------------------------------------------------------------------
// Пользователи и вход
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: roleEnum('role').notNull().default('student'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull().default(''),
  phone: text('phone').notNull().unique(),
  birthDate: date('birth_date'),
  sex: sexEnum('sex').notNull().default('female'),
  timezone: text('timezone').notNull().default('Europe/Moscow'),
  isBlocked: boolean('is_blocked').notNull().default(false),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('otp_phone_idx').on(t.phone, t.createdAt)],
);

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Программы и доступ
// ---------------------------------------------------------------------------

export const programs = pgTable('programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: programKindEnum('kind').notNull().default('marathon'),
  defaultDurationDays: integer('default_duration_days').notNull().default(30),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: createdAt(),
});

export const cohorts = pgTable('cohorts', {
  id: uuid('id').primaryKey().defaultRandom(),
  programId: uuid('program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  createdAt: createdAt(),
});

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
    cohortId: uuid('cohort_id').references(() => cohorts.id, { onDelete: 'set null' }),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    status: enrollmentStatusEnum('status').notNull().default('active'),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('enrollments_user_idx').on(t.userId)],
);

export const enrollmentEvents = pgTable('enrollment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .references(() => enrollments.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

/** Закрепление ученицы за наставником (или куратором на этапе 3). */
export const mentorAssignments = pgTable(
  'mentor_assignments',
  {
    mentorId: uuid('mentor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.mentorId, t.studentId] }), index('ma_student_idx').on(t.studentId)],
);

// ---------------------------------------------------------------------------
// Анкета и цели
// ---------------------------------------------------------------------------

export const questionnaires = pgTable('questionnaires', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  weightKg: doublePrecision('weight_kg').notNull(),
  targetWeightKg: doublePrecision('target_weight_kg').notNull(),
  heightCm: doublePrecision('height_cm').notNull(),
  birthDate: date('birth_date').notNull(),
  sex: sexEnum('sex').notNull().default('female'),
  activityLevel: activityLevelEnum('activity_level').notNull(),
  pregnancyOrLactation: boolean('pregnancy_or_lactation').notNull().default(false),
  medicalConditions: boolean('medical_conditions').notNull().default(false),
  edHistory: boolean('ed_history'),
  createdAt: createdAt(),
});

export const nutritionTargets = pgTable(
  'nutrition_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kcal: integer('kcal').notNull(),
    proteinG: integer('protein_g').notNull(),
    fatG: integer('fat_g').notNull(),
    carbsG: integer('carbs_g').notNull(),
    deficitPct: doublePrecision('deficit_pct').notNull().default(0),
    source: targetSourceEnum('source').notNull().default('auto'),
    setById: uuid('set_by_id').references(() => users.id, { onDelete: 'set null' }),
    requiresReview: boolean('requires_review').notNull().default(false),
    notes: text('notes').array().notNull().default(emptyTextArray),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [index('targets_user_idx').on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Дневник
// ---------------------------------------------------------------------------

export const weightEntries = pgTable(
  'weight_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    diaryDate: date('diary_date').notNull(),
    weightKg: doublePrecision('weight_kg').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('weight_user_date_uq').on(t.userId, t.diaryDate)],
);

export interface FoodPortions {
  piece?: number;
  slice?: number;
  glass?: number;
  cup?: number;
  tbsp?: number;
  tsp?: number;
  bowl?: number;
  portion?: number;
  handful?: number;
  wineglass?: number;
  bottle?: number;
}

export const foods = pgTable('foods', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  synonyms: text('synonyms').array().notNull().default(emptyTextArray),
  category: text('category').notNull().default('другое'),
  kcal: doublePrecision('kcal').notNull(),
  protein: doublePrecision('protein').notNull(),
  fat: doublePrecision('fat').notNull(),
  carbs: doublePrecision('carbs').notNull(),
  defaultGrams: doublePrecision('default_grams').notNull().default(100),
  portions: jsonb('portions').$type<FoodPortions>().notNull().default({}),
  source: text('source').notNull().default('reference'),
  isActive: boolean('is_active').notNull().default(true),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const meals = pgTable(
  'meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    diaryDate: date('diary_date').notNull(),
    /** Местное время HH:MM — для отображения и статистики по времени суток. */
    localTime: text('local_time').notNull(),
    eatenAt: timestamp('eaten_at', { withTimezone: true }).notNull(),
    mealType: mealTypeEnum('meal_type').notNull(),
    description: text('description').notNull().default(''),
    rawInput: text('raw_input'),
    inputMethod: inputMethodEnum('input_method').notNull().default('text'),
    kcal: doublePrecision('kcal').notNull().default(0),
    protein: doublePrecision('protein').notNull().default(0),
    fat: doublePrecision('fat').notNull().default(0),
    carbs: doublePrecision('carbs').notNull().default(0),
    isOvereating: boolean('is_overeating').notNull().default(false),
    aiRequestId: uuid('ai_request_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('meals_user_date_idx').on(t.userId, t.diaryDate)],
);

export const mealItems = pgTable(
  'meal_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    name: text('name').notNull(),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
    grams: doublePrecision('grams').notNull(),
    quantityText: text('quantity_text'),
    kcalPer100: doublePrecision('kcal_per100').notNull(),
    proteinPer100: doublePrecision('protein_per100').notNull(),
    fatPer100: doublePrecision('fat_per100').notNull(),
    carbsPer100: doublePrecision('carbs_per100').notNull(),
    kcal: doublePrecision('kcal').notNull(),
    protein: doublePrecision('protein').notNull(),
    fat: doublePrecision('fat').notNull(),
    carbs: doublePrecision('carbs').notNull(),
    valueSource: valueSourceEnum('value_source').notNull(),
    isEstimated: boolean('is_estimated').notNull().default(false),
  },
  (t) => [index('meal_items_meal_idx').on(t.mealId)],
);

export const overeatingNotes = pgTable('overeating_notes', {
  mealId: uuid('meal_id')
    .primaryKey()
    .references(() => meals.id, { onDelete: 'cascade' }),
  situationTags: text('situation_tags').array().notNull().default(emptyTextArray),
  situationText: text('situation_text'),
  emotionsBefore: text('emotions_before').array().notNull().default(emptyTextArray),
  emotionsAfter: text('emotions_after').array().notNull().default(emptyTextArray),
  comment: text('comment'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dictionaryItems = pgTable(
  'dictionary_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: dictionaryKindEnum('kind').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('dictionary_kind_label_uq').on(t.kind, t.label)],
);

// ---------------------------------------------------------------------------
// Итоги и отчёты
// ---------------------------------------------------------------------------

export const dailySummaries = pgTable(
  'daily_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    diaryDate: date('diary_date').notNull(),
    facts: jsonb('facts').$type<DayFacts>().notNull(),
    factsHash: text('facts_hash').notNull(),
    text: text('text').notNull(),
    question: text('question'),
    engine: text('engine').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('daily_user_date_uq').on(t.userId, t.diaryDate)],
);

export interface WeeklyReportText {
  summary: string;
  positives: string[];
  observations: string[];
  patterns: string[];
  questions: string[];
}

export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(),
    facts: jsonb('facts').$type<WeekFacts>().notNull(),
    factsHash: text('facts_hash').notNull(),
    text: jsonb('text').$type<WeeklyReportText>().notNull(),
    engine: text('engine').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version').notNull(),
    mentorComment: text('mentor_comment'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('weekly_user_week_uq').on(t.userId, t.weekStart)],
);

// ---------------------------------------------------------------------------
// Обратная связь и уведомления
// ---------------------------------------------------------------------------

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: commentTargetEnum('target_type').notNull(),
    /** id приёма пищи / взвешивания, дата дня или понедельник недели. */
    targetId: text('target_id').notNull(),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    /** Прочитано второй стороной (ученицей — комментарий наставника, наставником — ответ ученицы). */
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('comments_student_idx').on(t.studentId, t.createdAt),
    index('comments_target_idx').on(t.targetType, t.targetId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    link: text('link'),
    dedupeKey: text('dedupe_key').unique(),
    channels: text('channels').array().notNull().default(emptyTextArray),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const notificationSettings = pgTable('notification_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  weighInEnabled: boolean('weigh_in_enabled').notNull().default(true),
  weighInTime: text('weigh_in_time').notNull().default('08:00'),
  diaryEnabled: boolean('diary_enabled').notNull().default(true),
  diaryTime: text('diary_time').notNull().default('20:00'),
  commentsEnabled: boolean('comments_enabled').notNull().default(true),
  reportsEnabled: boolean('reports_enabled').notNull().default(true),
  accessEnabled: boolean('access_enabled').notNull().default(true),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Согласия, аудит, учёт ИИ
// ---------------------------------------------------------------------------

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: consentTypeEnum('type').notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
  },
  (t) => [index('consents_user_idx').on(t.userId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_student_idx').on(t.studentId, t.createdAt)],
);

export const aiRequests = pgTable(
  'ai_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    feature: text('feature').notNull(),
    engine: text('engine').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    success: boolean('success').notNull(),
    fallbackUsed: boolean('fallback_used').notNull().default(false),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('ai_requests_created_idx').on(t.createdAt)],
);
