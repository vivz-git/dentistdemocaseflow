import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/domain/defaults";
import { validateSettings } from "./settings";

describe("settings validation", () => {
  it("accepts the defaults", () => {
    expect(validateSettings(defaultSettings())).toEqual({});
  });
  it("flags invalid hours, sequences and templates", () => {
    const s = defaultSettings();
    s.workingHours[1].end = "08:00";
    s.followUp.steps[1].dayOffset = 0;
    s.templates[0].body = "Hello {{unknown}}";
    s.channels.enabled = [];
    const e = validateSettings(s);
    expect(e["hours.1"]).toBeTruthy();
    expect(e["followUp.steps"]).toBeTruthy();
    expect(e["templates.tpl_initial"]).toBeTruthy();
    expect(e["channels"]).toBeTruthy();
  });
});
