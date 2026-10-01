import { expect, test, type Page } from "@playwright/test";

/**
 * The acceptance story from the brief, end to end, against the real UI.
 * Every run starts from a fresh demo seed (empty localStorage).
 */

async function recoveredCount(page: Page) {
  await page.goto("/analytics");
  const tile = page.locator("dt", { hasText: "Recovered cases" }).locator("xpath=following-sibling::dd[1]");
  return Number(await tile.textContent());
}

async function openCase(page: Page, name: string) {
  await page.goto("/cases?status=all");
  await page.getByPlaceholder("Search patient").fill(name);
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByText("Next step", { exact: true })).toBeVisible();
}

const quickReplies = (page: Page) => page.getByLabel("Patient quick replies");

test("treatment plan to scheduled treatment, guardrails, opt-out and reactivation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const before = await recoveredCount(page);
  expect(before).toBeGreaterThan(0);

  // 1–3. Open a treatment plan, see it is not scheduled, open the case.
  await page.goto("/plans");
  await page.getByRole("link", { name: "Rahul Verma" }).click();
  await expect(page.getByText("The patient has not scheduled this treatment")).toBeVisible();
  await page.getByRole("link", { name: "Open follow-up case" }).click();
  await expect(page.getByRole("heading", { name: /Rahul Verma/ })).toContainText("Pending");

  // 4–5. Start follow-up; the conversation shows the AI message.
  await page.getByRole("button", { name: "Start follow-up" }).first().click();
  await expect(page.getByRole("heading", { name: /Rahul Verma/ })).toContainText("Follow-up Active");
  const thread = page.getByRole("log", { name: "Message thread" });
  await expect(thread).toContainText("Hi Rahul, thank you for visiting SmileCare Dental Clinic");

  // 6–8. Patient engages and chooses booking; slots appear.
  await quickReplies(page).getByRole("button", { name: "Book treatment" }).click();
  await expect(page.getByRole("heading", { name: /Rahul Verma/ })).toContainText("Engaged");
  await expect(thread).toContainText("Here are the next available times");
  const slots = page.getByText("Patient chooses a time").locator("..").getByRole("button");
  await expect(slots.first()).toBeVisible();

  // 9–12. Select a slot → appointment, Scheduled, timeline entry.
  await slots.first().click();
  await expect(page.getByRole("heading", { name: /Rahul Verma/ })).toContainText("Scheduled");
  await expect(thread).toContainText("Booked:");
  await expect(page.getByText("Appointment booked by patient").first()).toBeVisible();
  await expect(page.getByText("Booked by the patient via CaseFlow")).toBeVisible();

  // 13–14. Dashboard and analytics reflect the conversion.
  await page.goto("/");
  await expect(page.getByText(new RegExp(`from ${before + 1} plans scheduled after follow-up`))).toBeVisible();
  expect(await recoveredCount(page)).toBe(before + 1);

  // 15–16. A different patient asks a clinical question → Needs Human, no clinical answer.
  await openCase(page, "Kavya Reddy");
  await page.getByRole("textbox", { name: "Patient message" }).fill("Will this hurt? Can I take a painkiller before?");
  await page.getByRole("textbox", { name: "Patient message" }).press("Enter");
  await expect(page.getByRole("heading", { name: /Kavya Reddy/ })).toContainText("Needs Human");
  await expect(page.getByRole("log", { name: "Message thread" })).toContainText("your dentist or clinic team should advise you");
  await expect(page.getByText("Detected: Clinical question")).toBeVisible();

  // 17–18. Another patient opts out → automation stops.
  await openCase(page, "Arjun Malhotra");
  await quickReplies(page).getByRole("button", { name: "Stop messages" }).click();
  await expect(page.getByRole("heading", { name: /Arjun Malhotra/ })).toContainText("Do Not Contact");
  await expect(page.getByText("Automation stopped").first()).toBeVisible();
  await page.getByRole("tab", { name: "Reply as staff" }).click();
  await expect(page.getByText("This patient opted out")).toBeVisible();
  // The scheduler never messages them again.
  await page.goto("/follow-ups");
  await expect(page.locator("main")).not.toContainText("Arjun Malhotra");

  // 19–20. A deferred patient becomes eligible and is reactivated.
  await page.goto("/campaigns/new?kind=reactivation");
  await expect(page.getByText("Priya Nair")).toBeVisible();
  await page.getByRole("button", { name: "Save draft for approval" }).click();
  await expect(page.getByRole("heading", { name: /Deferred patients/ })).toContainText("Draft");
  await page.getByRole("button", { name: "Validate & approve" }).click();
  await expect(page.getByRole("heading", { name: /Deferred patients/ })).toContainText("Approved");
  await page.getByRole("button", { name: "Launch (simulated)" }).click();
  await page.getByRole("button", { name: "Launch simulated send" }).click();
  await expect(page.getByRole("heading", { name: /Deferred patients/ })).toContainText("Running");
  await page.getByRole("link", { name: /Priya Nair/ }).click();
  await expect(page.getByRole("log", { name: "Message thread" })).toContainText("you previously discussed treatment");
  await quickReplies(page).getByRole("button", { name: "Book treatment" }).click();
  await page.getByText("Patient chooses a time").locator("..").getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: /Priya Nair/ })).toContainText("Scheduled");
  await page.goBack();
  await expect(page.getByText("Scheduled", { exact: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("settings save and drive assistant answers; template validation blocks bad wording", async ({ page }) => {
  await page.goto("/settings?tab=knowledge");
  const parking = page.getByLabel("Parking and directions");
  await parking.fill("Valet parking at the front entrance.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await openCase(page, "Pooja Banerjee");
  await page.getByRole("button", { name: "Is there parking near the clinic?" }).click();
  await expect(page.getByRole("log", { name: "Message thread" })).toContainText("Valet parking at the front entrance.");

  await page.goto("/settings?tab=messages");
  const body = page.getByLabel("Message").first();
  await body.fill("Last chance {{patient_first_name}}! Book with {{clinic_name}} {{discount_code}}");
  await expect(page.getByText(/creates artificial urgency/).first()).toBeVisible();
  await expect(page.getByText(/is not a supported placeholder/).first()).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Fix \d+ issue/)).toBeVisible();
});

test("staff controls: take over, return to automation, book and cancel", async ({ page }) => {
  await openCase(page, "Harish Gowda");
  await page.getByRole("button", { name: "Take over" }).click();
  await expect(page.getByText("Staff in control").first()).toBeVisible();
  await page.getByRole("tab", { name: "Reply as staff" }).click();
  await page.getByLabel(/Message to Harish/).fill("Hi Harish, this is Meera from SmileCare. Happy to help you find a time.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log", { name: "Message thread" })).toContainText("this is Meera from SmileCare");
  await page.getByRole("button", { name: "Return to automation" }).click();
  await expect(page.getByText("Automation on").first()).toBeVisible();

  await page.getByRole("button", { name: "Book for patient" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio").first().click();
  await dialog.getByRole("button", { name: "Book appointment" }).click();
  await expect(page.getByRole("heading", { name: /Harish Gowda/ })).toContainText("Scheduled");

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Cancellation reason").fill("Patient travelling");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel appointment" }).click();
  await expect(page.getByRole("heading", { name: /Harish Gowda/ })).toContainText("Engaged");
});
