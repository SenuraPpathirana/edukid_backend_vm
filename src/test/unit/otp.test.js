import { describe, it, expect } from "@jest/globals";
import { generateOtp6, otpExpiryDate } from "../../utils/otp.js";

describe("generateOtp6", () => {
  it("returns a 6-character string", () => {
    const otp = generateOtp6();
    expect(otp).toHaveLength(6);
  });

  it("returns only numeric digits", () => {
    const otp = generateOtp6();
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it("returns a value between 100000 and 999999", () => {
    const otp = Number(generateOtp6());
    expect(otp).toBeGreaterThanOrEqual(100000);
    expect(otp).toBeLessThanOrEqual(999999);
  });

  it("generates different values on successive calls (probabilistic)", () => {
    const otps = new Set(Array.from({ length: 20 }, () => generateOtp6()));
    // With 20 calls, the chance of all being identical is astronomically low
    expect(otps.size).toBeGreaterThan(1);
  });
});

describe("otpExpiryDate", () => {
  it("returns an ISO string", () => {
    const expiry = otpExpiryDate(10);
    expect(() => new Date(expiry)).not.toThrow();
    expect(typeof expiry).toBe("string");
  });

  it("returns a date in the future", () => {
    const expiry = new Date(otpExpiryDate(10));
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it("adds the correct number of minutes (within 1 second tolerance)", () => {
    const minutes = 15;
    const before = Date.now();
    const expiry = new Date(otpExpiryDate(minutes)).getTime();
    const after = Date.now();

    const expectedMin = before + minutes * 60 * 1000;
    const expectedMax = after + minutes * 60 * 1000;

    expect(expiry).toBeGreaterThanOrEqual(expectedMin);
    expect(expiry).toBeLessThanOrEqual(expectedMax + 1000);
  });

  it("handles 0 minutes (returns approximately now)", () => {
    const before = Date.now();
    const expiry = new Date(otpExpiryDate(0)).getTime();
    expect(expiry).toBeGreaterThanOrEqual(before - 100);
    expect(expiry).toBeLessThanOrEqual(before + 1000);
  });
});
