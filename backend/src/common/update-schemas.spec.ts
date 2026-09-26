import * as shared from "@mashkoor/shared";

/**
 * Regression guard for the "PATCH wipes data" bug: in Zod 4 an omitted key still runs through `.default()` and
 * `.optional().nullable().transform(v => v || null)`, so a PATCH that mentioned one field used to reset the rest.
 * Every schema whose name says "update" must leave an empty body empty.
 */
const updateSchemas = Object.entries(shared).filter(([name, value]) => /update/i.test(name) && typeof (value as { safeParse?: unknown })?.safeParse === "function") as [string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }][];

describe("update (PATCH) schemas", () => {
  it("finds the update schemas", () => {
    expect(updateSchemas.length).toBeGreaterThanOrEqual(19);
  });

  it.each(updateSchemas.map(([name]) => name))("%s: an empty body writes nothing", (name) => {
    const schema = updateSchemas.find(([n]) => n === name)![1];
    const result = schema.safeParse({});
    // Schemas that require identifying fields (e.g. a booking id) may legitimately reject `{}`.
    if (result.success) expect(result.data).toEqual({});
  });

  it("keeps fields the caller did not send (lead)", () => {
    const parsed = shared.leadUpdateSchema.parse({ priority: "HOT" });
    expect(parsed).toEqual({ priority: "HOT" });
  });

  it("keeps fields the caller did not send (customer): consent must not be reset", () => {
    expect(shared.customerUpdateSchema.parse({ fullName: "Renamed Person" })).toEqual({ fullName: "Renamed Person" });
  });

  it("keeps a task's description when only the status changes", () => {
    expect(shared.taskUpdateSchema.parse({ status: "DONE" })).toEqual({ status: "DONE" });
  });

  it("still lets a caller clear a field explicitly", () => {
    expect(shared.leadUpdateSchema.parse({ destination: "", requirements: null })).toEqual({ destination: null, requirements: null });
  });

  it("still validates what was sent, with the original message", () => {
    const result = shared.leadUpdateSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Enter a valid email address");
  });

  it("the B2C profile schema (a pick of the customer update schema) cannot reset opt-in", () => {
    const b2c = shared.customerUpdateSchema.pick({ fullName: true, altPhone: true, email: true, whatsappOptIn: true, preferredChannel: true, city: true, state: true });
    expect(b2c.parse({ city: "Thane" })).toEqual({ city: "Thane" });
  });
});
