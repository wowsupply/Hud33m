import { z } from 'zod';
import { ACTIVITY_LEVELS, INPUT_METHODS, MEAL_TYPES, SEXES, VALUE_SOURCES } from './constants';
import { isDateStr } from './dates';

export const dateStrSchema = z.string().refine(isDateStr, 'Неверная дата');
export const timeStrSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Неверное время');

export const questionnaireSchema = z.object({
  weightKg: z.number().min(30).max(350),
  targetWeightKg: z.number().min(30).max(350),
  heightCm: z.number().min(120).max(230),
  birthDate: dateStrSchema,
  activityLevel: z.enum(ACTIVITY_LEVELS),
  sex: z.enum(SEXES).default('female'),
  pregnancyOrLactation: z.boolean().default(false),
  medicalConditions: z.boolean().default(false),
  edHistory: z.boolean().nullable().default(null),
});
export type QuestionnaireInput = z.infer<typeof questionnaireSchema>;

export const per100Schema = z.object({
  kcal: z.number().min(0).max(950),
  protein: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
});

export const mealItemInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  foodId: z.uuid().nullable(),
  grams: z.number().min(0).max(5000),
  per100: per100Schema,
  valueSource: z.enum(VALUE_SOURCES),
  isEstimated: z.boolean(),
  quantityText: z.string().max(60).nullable(),
});
export type MealItemInput = z.infer<typeof mealItemInputSchema>;

const label = z.string().trim().min(1).max(60);

export const overeatingNoteSchema = z.object({
  situationTags: z.array(label).max(12).default([]),
  situationText: z.string().trim().max(2000).nullable().default(null),
  emotionsBefore: z.array(label).max(12).default([]),
  emotionsAfter: z.array(label).max(12).default([]),
  comment: z.string().trim().max(2000).nullable().default(null),
});
export type OvereatingNoteInput = z.infer<typeof overeatingNoteSchema>;

export const mealInputSchema = z.object({
  diaryDate: dateStrSchema,
  time: timeStrSchema,
  mealType: z.enum(MEAL_TYPES),
  description: z.string().trim().max(300).default(''),
  rawInput: z.string().trim().max(2000).nullable().default(null),
  inputMethod: z.enum(INPUT_METHODS).default('text'),
  items: z.array(mealItemInputSchema).min(1, 'Добавьте хотя бы один продукт').max(40),
  isOvereating: z.boolean().default(false),
  note: overeatingNoteSchema.nullable().default(null),
});
export type MealInput = z.infer<typeof mealInputSchema>;

export const weightInputSchema = z.object({
  date: dateStrSchema,
  weightKg: z.number().min(30).max(350),
});

export const notificationSettingsSchema = z.object({
  weighInEnabled: z.boolean(),
  weighInTime: timeStrSchema,
  diaryEnabled: z.boolean(),
  diaryTime: timeStrSchema,
  commentsEnabled: z.boolean(),
  reportsEnabled: z.boolean(),
  accessEnabled: z.boolean(),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
