import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getApiUrl } from "@/lib/api";
import { TEST_API } from "./test-utils";

const CUSTOM_API = `${TEST_API.replace(":8000", ":9000")}`;

describe("getApiUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns NEXT_PUBLIC_API_URL when set", () => {
    process.env.NEXT_PUBLIC_API_URL = CUSTOM_API;
    expect(getApiUrl()).toBe(CUSTOM_API);
  });

  it("returns hostname-based URL when in browser", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    // jsdom sets window.location.hostname to "localhost"
    expect(getApiUrl()).toBe(TEST_API);
  });
});
