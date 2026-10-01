import { describe, expect, it } from "vitest";
import { defaultSettings } from "./defaults";
import { renderTemplate, validateTemplate } from "./templates";

describe("template validation", () => {
  it("accepts every default template", () => {
    for (const t of defaultSettings().templates) {
      expect(validateTemplate(t.body).errors, t.name).toEqual([]);
    }
  });

  it("rejects empty messages", () => {
    expect(validateTemplate("   ").ok).toBe(false);
  });

  it("rejects unsupported and malformed placeholders", () => {
    const v = validateTemplate("Hi {{patient_first_name}} from {{clinic_name}} — {{price}}");
    expect(v.errors.some((e) => e.includes("{{price}}"))).toBe(true);
    expect(validateTemplate("Hi {patient_first_name} from {{clinic_name}}").errors[0]).toMatch(/malformed/);
    expect(validateTemplate("Hi {{patient_first_name} from {{clinic_name}}").ok).toBe(false);
  });

  it("requires the patient name and clinic name", () => {
    const v = validateTemplate("Please book your appointment.");
    expect(v.errors).toContain("Missing required placeholder {{patient_first_name}}.");
    expect(v.errors).toContain("Missing required placeholder {{clinic_name}}.");
  });

  it("blocks pressure and clinical-claim wording", () => {
    for (const bad of ["Last chance to book!", "You must book now", "Your condition will get worse", "Don't delay"]) {
      expect(validateTemplate(`Hi {{patient_first_name}}, {{clinic_name}}: ${bad}`).ok, bad).toBe(false);
    }
  });

  it("warns on prices", () => {
    expect(validateTemplate("Hi {{patient_first_name}}, {{clinic_name}} offer: ₹500 off").warnings.length).toBeGreaterThan(0);
  });

  it("renders variables", () => {
    expect(renderTemplate("Hi {{ patient_first_name }}", { patient_first_name: "Priya" })).toBe("Hi Priya");
  });
});
