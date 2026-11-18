/** Рабочее название приложения. Окончательное название — вопрос к заказчице. */
export const APP_NAME = 'Дневник питания';

// ---------------------------------------------------------------------------
// Приёмы пищи
// ---------------------------------------------------------------------------

export const MEAL_TYPES = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'extra',
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  morning_snack: 'Перекус',
  lunch: 'Обед',
  afternoon_snack: 'Полдник',
  dinner: 'Ужин',
  extra: 'Дополнительный приём',
};

/** Тип приёма пищи по умолчанию — по местному часу. */
export function defaultMealTypeForHour(hour: number): MealType {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 12) return 'morning_snack';
  if (hour >= 12 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'afternoon_snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'extra';
}

export const INPUT_METHODS = ['text', 'manual', 'repeat', 'photo', 'voice'] as const;
export type InputMethod = (typeof INPUT_METHODS)[number];

export const VALUE_SOURCES = ['db', 'ai', 'manual'] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

// ---------------------------------------------------------------------------
// Активность и анкета
// ---------------------------------------------------------------------------

export const ACTIVITY_LEVELS = ['minimal', 'low', 'medium', 'high', 'very_high'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_INFO: Record<ActivityLevel, { label: string; hint: string; factor: number }> = {
  minimal: { label: 'Минимальная', hint: 'Сидячая работа, почти без движения', factor: 1.2 },
  low: { label: 'Низкая', hint: 'Прогулки или лёгкие тренировки 1–3 раза в неделю', factor: 1.375 },
  medium: { label: 'Средняя', hint: 'Тренировки 3–5 раз в неделю', factor: 1.55 },
  high: { label: 'Высокая', hint: 'Интенсивные тренировки 6–7 раз в неделю', factor: 1.725 },
  very_high: {
    label: 'Очень высокая',
    hint: 'Физическая работа или тренировки дважды в день',
    factor: 1.9,
  },
};

export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];

// ---------------------------------------------------------------------------
// Эмоции и ситуации (начальные значения справочников; редактируются в кабинете)
// ---------------------------------------------------------------------------

export const DEFAULT_EMOTIONS_BEFORE = [
  'тревога',
  'раздражение',
  'одиночество',
  'скука',
  'усталость',
  'грусть',
  'стресс',
  'радость',
  'спокойствие',
];

export const DEFAULT_EMOTIONS_AFTER = [
  'удовлетворение',
  'спокойствие',
  'чувство вины',
  'сожаление',
  'разочарование',
  'тревога',
  'облегчение',
];

export const DEFAULT_SITUATIONS = [
  'конфликт',
  'тяжёлый рабочий день',
  'одиночество',
  'скука',
  'усталость',
  'праздник или событие',
];

export const DICTIONARY_KINDS = ['emotion_before', 'emotion_after', 'situation'] as const;
export type DictionaryKind = (typeof DICTIONARY_KINDS)[number];

// ---------------------------------------------------------------------------
// Время суток
// ---------------------------------------------------------------------------

export const DAY_PARTS = ['morning', 'day', 'evening', 'night'] as const;
export type DayPart = (typeof DAY_PARTS)[number];

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'утро',
  day: 'день',
  evening: 'вечер',
  night: 'ночь',
};

/** утро 05–11, день 11–16, вечер 16–21, ночь 21–05 */
export function dayPartOfHour(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'day';
  if (hour >= 16 && hour < 21) return 'evening';
  return 'night';
}

// ---------------------------------------------------------------------------
// Пороговые значения отчётов (вопрос к заказчице — значения по умолчанию)
// ---------------------------------------------------------------------------

/** День считается «с превышением», если калорийность выше цели больше чем на 10 %. */
export const OVER_TARGET_TOLERANCE = 0.1;
/** «Полный» день дневника — не меньше трёх приёмов пищи. */
export const FULL_DAY_MIN_MEALS = 3;

// ---------------------------------------------------------------------------
// Роли, доступ
// ---------------------------------------------------------------------------

export const ROLES = ['admin', 'mentor', 'student'] as const;
export type Role = (typeof ROLES)[number];

export const ENROLLMENT_STATUSES = ['active', 'paused', 'expired', 'closed'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Активен',
  paused: 'Приостановлен',
  expired: 'Завершён',
  closed: 'Закрыт',
};

export const PROGRAM_KINDS = ['marathon', 'individual'] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];
export const PROGRAM_KIND_LABELS: Record<ProgramKind, string> = {
  marathon: 'Марафон',
  individual: 'Индивидуальное сопровождение',
};

// ---------------------------------------------------------------------------
// Комментарии и уведомления
// ---------------------------------------------------------------------------

export const COMMENT_TARGETS = ['meal', 'day', 'week', 'weight'] as const;
export type CommentTarget = (typeof COMMENT_TARGETS)[number];

export const NOTIFICATION_TYPES = [
  'weigh_in_reminder',
  'diary_reminder',
  'mentor_comment',
  'student_reply',
  'weekly_report_ready',
  'access_ending',
  'access_ended',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ---------------------------------------------------------------------------
// Согласия. Тексты — черновики, окончательные предоставит юрист.
// ---------------------------------------------------------------------------

export const CONSENT_TYPES = ['personal_data', 'health_data', 'ai_processing', 'marketing'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export interface ConsentDoc {
  version: string;
  title: string;
  required: boolean;
  text: string;
}

export const CONSENT_DOCS: Record<ConsentType, ConsentDoc> = {
  personal_data: {
    version: 'draft-1',
    title: 'Согласие на обработку персональных данных',
    required: true,
    text: 'Я даю согласие на обработку моих персональных данных (имя, фамилия, телефон, дата рождения) для предоставления доступа к приложению и сопровождения в программе. Черновик — окончательный текст предоставит юрист.',
  },
  health_data: {
    version: 'draft-1',
    title: 'Согласие на обработку сведений о питании, весе и самочувствии',
    required: true,
    text: 'Я даю согласие на обработку сведений о моём весе, питании и эмоциональном состоянии, которые я вношу в дневник, и на их просмотр моим наставником. Черновик — окончательный текст предоставит юрист.',
  },
  ai_processing: {
    version: 'draft-1',
    title: 'Согласие на анализ записей с помощью ИИ',
    required: false,
    text: 'Я согласна, что мои записи будут обрабатываться сервисом искусственного интеллекта для расчёта калорийности и подготовки кратких итогов. Без этого согласия расчёт выполняется по базе продуктов, а итоги формируются по шаблону. Черновик — окончательный текст предоставит юрист.',
  },
  marketing: {
    version: 'draft-1',
    title: 'Согласие на получение информации о новых программах',
    required: false,
    text: 'Я согласна получать сообщения о новых марафонах, программах и предложениях. Согласие можно отозвать в профиле. Черновик — окончательный текст предоставит юрист.',
  },
};

export const AI_DISCLAIMER =
  'Анализ — инструмент самонаблюдения, а не медицинское или психологическое заключение.';
export const TARGETS_DISCLAIMER =
  'Это ориентир для самонаблюдения, а не медицинская рекомендация. Цели согласуются с наставником.';
