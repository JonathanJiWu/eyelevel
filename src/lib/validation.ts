import { LIMITS } from "@/src/data/types";

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

/** Collapse whitespace and strip control characters from free text. */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Like sanitizeText but keeps single newlines (for bios/descriptions). */
export function sanitizeMultiline(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "Enter your email address.";
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}

export function validateDisplayName(name: string): string | null {
  const value = sanitizeText(name, 1000);
  if (!value) return "Enter a display name.";
  if (value.length > LIMITS.displayName) return `Keep it under ${LIMITS.displayName} characters.`;
  return null;
}

export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (!value) return "Choose a username.";
  if (value.length < LIMITS.username.min) return `Use at least ${LIMITS.username.min} characters.`;
  if (value.length > LIMITS.username.max) return `Use at most ${LIMITS.username.max} characters.`;
  if (!USERNAME_PATTERN.test(value)) return "Use only letters, numbers and underscores.";
  return null;
}

export function validateListName(name: string): string | null {
  const value = sanitizeText(name, 1000);
  if (!value) return "Give your list a name.";
  if (value.length > LIMITS.listName) return `Keep it under ${LIMITS.listName} characters.`;
  return null;
}

/** Derive a valid username candidate from a name or email. */
export function usernameFromName(source: string): string {
  const base = source
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split("@")[0]
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 14);
  return base.length >= 3 ? base : `user${base}`.slice(0, 14).padEnd(4, "0");
}
