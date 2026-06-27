import { describe, expect, it } from "vitest";
import { emailDomain, isEmailDomainAllowed } from "./email-domain";

// IA invariant 4 — account creation is restricted to allowed email domains.
const ALLOWED = ["example.com", "example.org"];

describe("emailDomain", () => {
  it("extracts the lowercased domain", () => {
    expect(emailDomain("alice@Example.COM")).toBe("example.com");
    expect(emailDomain("a.b+tag@example.org")).toBe("example.org");
  });

  it("returns null for malformed emails", () => {
    for (const bad of ["", "no-at", "@example.com", "x@", "@", "  "]) {
      expect(emailDomain(bad)).toBeNull();
    }
  });
});

describe("isEmailDomainAllowed", () => {
  it("accepts the allowed domains, case-insensitively", () => {
    expect(isEmailDomainAllowed("alice@example.com", ALLOWED)).toBe(true);
    expect(isEmailDomainAllowed("Bob@EXAMPLE.ORG", ALLOWED)).toBe(true);
  });

  it("rejects any other domain", () => {
    expect(isEmailDomainAllowed("mallory@gmail.com", ALLOWED)).toBe(false);
    expect(isEmailDomainAllowed("evil@example.net", ALLOWED)).toBe(false);
  });

  it("rejects subdomains and look-alikes (exact match only)", () => {
    expect(isEmailDomainAllowed("x@sub.example.com", ALLOWED)).toBe(false);
    expect(isEmailDomainAllowed("x@example.com.evil.net", ALLOWED)).toBe(false);
    expect(isEmailDomainAllowed("x@notexample.com", ALLOWED)).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(isEmailDomainAllowed("not-an-email", ALLOWED)).toBe(false);
    expect(isEmailDomainAllowed("@example.com", ALLOWED)).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(isEmailDomainAllowed("alice@example.com", [])).toBe(false);
  });
});
