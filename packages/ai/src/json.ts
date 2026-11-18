/** Извлекает JSON-объект из ответа модели (с учётом ```json-обёрток и пояснений вокруг). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('В ответе модели нет JSON');
  return JSON.parse(body.slice(start, end + 1));
}
