import { describe, it, expect } from "@jest/globals";
import {
  normalizeEmail,
  isValidEmail,
  isStrongPassword,
} from "../../utils/validators.js";

describe("normalizeEmail", () => {
  it("trims whitespace", () => {
    expect(normalizeEmail("  jane@example.com  ")).toBe("jane@example.com");
  });

  it("converts to lowercase", () => {
    expect(normalizeEmail("JANE@EXAMPLE.COM")).toBe("jane@example.com");
  });

  it("handles null/undefined gracefully", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });

  it("handles empty string", () => {
    expect(normalizeEmail("")).toBe("");
  });
});

describe("isValidEmail", () => {
  it("accepts a valid email", () => {
    expect(isValidEmail("jane@example.com")).toBe(true);
  });

  it("accepts email with subdomain", () => {
    expect(isValidEmail("user@mail.example.co.uk")).toBe(true);
  });

  it("rejects email without @", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });

  it("rejects email without domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects email without TLD", () => {
    expect(isValidEmail("user@domain")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidEmail(null)).toBe(false);
  });

  it("rejects email with spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });
});

describe("isStrongPassword", () => {
  it("accepts a strong password", () => {
    expect(isStrongPassword("Secret123")).toBe(true);
  });

  it("accepts password with special characters", () => {
    expect(isStrongPassword("P@ssw0rd!")).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    expect(isStrongPassword("Ab1")).toBe(false);
  });

  it("rejects password without uppercase", () => {
    expect(isStrongPassword("secret123")).toBe(false);
  });

  it("rejects password without lowercase", () => {
    expect(isStrongPassword("SECRET123")).toBe(false);
  });

  it("rejects password without a number", () => {
    expect(isStrongPassword("SecretPass")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isStrongPassword("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isStrongPassword(null)).toBe(false);
  });
});
