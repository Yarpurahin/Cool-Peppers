import { z } from 'zod';

export const contactTopics = {
  question: 'Вопрос о проекте',
  issue: 'Что-то не работает',
  idea: 'Идея или новый сценарий',
  partnership: 'Сотрудничество',
} as const;

export const contactSchema = z
  .object({
    topic: z.enum(['question', 'issue', 'idea', 'partnership']),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Укажите email в формате name@example.ru.')
      .max(254),
    message: z
      .string()
      .trim()
      .min(20, 'Добавьте немного подробностей — хотя бы 20 символов.')
      .max(3000, 'Сократите сообщение до 3000 символов.')
      .refine((value) => !value.includes('\u0000'), 'Удалите недопустимый символ.'),
  })
  .strict();

export const contactSubmissionSchema = contactSchema.extend({ requestId: z.string().uuid() });
export type ContactInput = z.infer<typeof contactSchema>;
export interface ContactMessage extends ContactInput {
  id: string;
  createdAt: string;
}
export interface ContactInbox {
  messages: ContactMessage[];
  hasMore: boolean;
}
