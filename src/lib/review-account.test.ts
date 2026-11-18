import { describe, expect, it } from "vitest";
import { isReviewEmail, REVIEW_EMAIL } from "./review-account";

describe("isReviewEmail", () => {
  it("matches the review address however it is typed", () => {
    expect(isReviewEmail(REVIEW_EMAIL)).toBe(true);
    expect(isReviewEmail(`  ${REVIEW_EMAIL.toUpperCase()} `)).toBe(true);
  });

  it("leaves every other address on email codes", () => {
    expect(isReviewEmail("hello@studioliturgy.com")).toBe(false);
    expect(isReviewEmail(`x${REVIEW_EMAIL}`)).toBe(false);
    expect(isReviewEmail("")).toBe(false);
  });
});
