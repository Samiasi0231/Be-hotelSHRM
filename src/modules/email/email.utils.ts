// src/modules/email/email.utils.ts

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape anything a user typed before it goes into email HTML. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export const formatNaira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`;

export const formatDateGB = (d: Date, weekday: 'long' | 'short') =>
  new Date(d).toLocaleDateString('en-GB', {
    weekday,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const pluralize = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;