import { describe, expect, it } from "vitest";
import { HOME_SEO_TITLE, homeTitle } from "@/lib/home-title";
import { APP_NAME } from "@/lib/appConfig";

describe("homeTitle", () => {
  it("keeps the SEO title when signed out", () => {
    expect(homeTitle({ signedIn: false, landing: false, phoneTab: null })).toBe(HOME_SEO_TITLE);
    expect(homeTitle({ signedIn: false, landing: false, phoneTab: "catalogue" })).toBe(
      HOME_SEO_TITLE,
    );
  });

  it("keeps the SEO title on the intro page", () => {
    expect(homeTitle({ signedIn: true, landing: true, phoneTab: null })).toBe(HOME_SEO_TITLE);
  });

  it("reads Home when signed in on desktop", () => {
    expect(homeTitle({ signedIn: true, landing: false, phoneTab: null })).toBe(
      `Home | ${APP_NAME}`,
    );
  });

  it("follows the phone tab when signed in on the phone home", () => {
    expect(homeTitle({ signedIn: true, landing: false, phoneTab: "gatherings" })).toBe(
      `Gatherings | ${APP_NAME}`,
    );
    expect(homeTitle({ signedIn: true, landing: false, phoneTab: "catalogue" })).toBe(
      `Catalogue | ${APP_NAME}`,
    );
    expect(homeTitle({ signedIn: true, landing: false, phoneTab: "settings" })).toBe(
      `Settings | ${APP_NAME}`,
    );
  });
});
