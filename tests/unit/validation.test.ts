import { LruCache } from "@/src/lib/cache";
import { friendlyError } from "@/src/lib/errors";
import {
  sanitizeMultiline,
  sanitizeText,
  usernameFromName,
  validateDisplayName,
  validateEmail,
  validateListName,
  validatePassword,
  validateUsername,
} from "@/src/lib/validation";
import { safeRedirect } from "@/src/components/auth/AuthLayout";

describe("input validation", () => {
  it("validates emails", () => {
    expect(validateEmail("")).toMatch(/enter/i);
    expect(validateEmail("not-an-email")).toMatch(/valid/i);
    expect(validateEmail("a@b.co")).toBeNull();
  });
  it("enforces a sensible password policy", () => {
    expect(validatePassword("short1")).toMatch(/8/);
    expect(validatePassword("allletters")).toMatch(/letter and one number/);
    expect(validatePassword("12345678")).toMatch(/letter and one number/);
    expect(validatePassword("movies2024")).toBeNull();
  });
  it("validates usernames", () => {
    expect(validateUsername("ab")).toMatch(/at least 3/);
    expect(validateUsername("a".repeat(21))).toMatch(/at most 20/);
    expect(validateUsername("bad name")).toMatch(/letters, numbers/);
    expect(validateUsername("good_name_1")).toBeNull();
  });
  it("validates display names and list names", () => {
    expect(validateDisplayName("   ")).toMatch(/enter/i);
    expect(validateDisplayName("x".repeat(41))).toMatch(/40/);
    expect(validateListName("")).toMatch(/name/);
    expect(validateListName("Weekend picks")).toBeNull();
  });
  it("sanitizes free text", () => {
    expect(sanitizeText("  hello\u0000\u0007 world  ", 100)).toBe("hello world");
    expect(sanitizeText("abcdef", 3)).toBe("abc");
    expect(sanitizeMultiline("line one\n\n\n\nline two\u0000", 100)).toBe("line one\n\nline two");
  });
  it("derives valid usernames from names and emails", () => {
    expect(usernameFromName("Amélie Poulain")).toBe("Amelie_Poulain");
    expect(usernameFromName("jo@example.com")).toMatch(/^[A-Za-z0-9_]{3,20}$/);
    expect(usernameFromName("!!")).toMatch(/^[A-Za-z0-9_]{3,20}$/);
  });
});

describe("safeRedirect (open-redirect protection)", () => {
  it("allows in-app paths only", () => {
    expect(safeRedirect("/movie/603")).toBe("/movie/603");
    expect(safeRedirect("https://evil.example")).toBe("/");
    expect(safeRedirect("//evil.example")).toBe("/");
    expect(safeRedirect("/login")).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
  });
});

describe("friendly errors", () => {
  it("maps Firebase codes to actionable messages", () => {
    expect(friendlyError({ code: "auth/invalid-credential" })).toBe("Email or password is incorrect.");
    expect(friendlyError({ code: "auth/email-already-in-use" })).toMatch(/already exists/);
    expect(friendlyError({ code: "permission-denied" })).toMatch(/permission/);
    expect(friendlyError(new Error("whatever"), "Fallback")).toBe("Fallback");
  });
});

describe("LruCache", () => {
  it("expires entries but keeps them available as stale fallbacks", () => {
    let now = 0;
    const cache = new LruCache<string>(2, () => now);
    cache.set("a", "A", 100);
    expect(cache.get("a")).toBe("A");
    now = 150;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.getStale("a")).toBe("A");
  });
  it("evicts the least recently used entry", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.get("a");
    cache.set("c", 3, 1000);
    expect(cache.getStale("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });
});
