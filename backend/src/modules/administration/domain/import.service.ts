import { Injectable } from "@nestjs/common";
import {
  customerInputSchema,
  leadInputSchema,
  LEAD_SOURCES,
  PRODUCT_TYPES,
  CUSTOMER_TYPES,
  LEAD_PRIORITIES,
  type ImportEntity,
  type ImportRequest,
  type ImportResult,
  type ImportRowResult,
} from "@mashkoor/shared";
import type { ZodError } from "zod";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { CustomersService } from "../../customers/domain/customers.service";
import { LeadsService } from "../../leads/domain/leads.service";

type Row = Record<string, string | null | undefined>;
interface Check {
  status: "valid" | "invalid" | "duplicate";
  label: string;
  errors: string[];
  create?: () => Promise<unknown>;
}

/** Header spellings people actually use → the field we mean. Compared after lowercasing and dropping non-letters. */
const HEADERS: Record<string, string> = {
  fullname: "name", name: "name", customername: "name", contactname: "name", contact: "name",
  phone: "phone", mobile: "phone", mobileno: "phone", mobilenumber: "phone", phoneno: "phone", phonenumber: "phone", contactno: "phone", whatsapp: "phone",
  altphone: "altPhone", alternatephone: "altPhone", altmobile: "altPhone",
  email: "email", emailid: "email", emailaddress: "email",
  city: "city", state: "state",
  type: "type", customertype: "type",
  source: "source", leadsource: "source",
  tags: "tags", notes: "notes", remarks: "notes", requirements: "notes", requirement: "notes",
  destination: "destination", trip: "productType", triptype: "productType", producttype: "productType", service: "productType",
  adults: "adults", children: "children", priority: "priority",
};

const canonical = (raw: Row): Row => {
  const out: Row = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = HEADERS[key.toLowerCase().replace(/[^a-z]/g, "")];
    if (field && value != null && String(value).trim() !== "") out[field] ??= String(value).trim();
  }
  return out;
};

const enumValue = <T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T | { invalid: string } => {
  if (!value) return fallback;
  const norm = value.toUpperCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(norm) ? (norm as T) : { invalid: value };
};

const messages = (error: ZodError) => error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`);

/** M15 · CSV import of customers and leads: validate every row first (preview), then create the good ones. */
@Injectable()
export class ImportService {
  constructor(
    private readonly abilities: AbilityFactory,
    private readonly customers: CustomersService,
    private readonly leads: LeadsService,
  ) {}

  async run(actor: RequestUser, request: ImportRequest): Promise<ImportResult> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("create", request.entity === "customers" ? "Customer" : "Lead")) throw AppError.forbidden();

    const seen = new Set<string>();
    const rows: ImportRowResult[] = [];
    const creators: { index: number; create: () => Promise<unknown> }[] = [];

    for (const [i, raw] of request.rows.entries()) {
      const row = canonical(raw);
      const line = i + 1;
      const result = request.entity === "customers" ? await this.checkCustomer(actor, row, seen) : this.checkLead(actor, row, seen);
      rows.push({ line, status: result.status, label: result.label, errors: result.errors });
      if (result.status === "valid" && result.create) creators.push({ index: rows.length - 1, create: result.create });
    }

    let imported = 0;
    if (request.commit) {
      for (const { index, create } of creators) {
        try {
          await create();
          rows[index]!.status = "imported";
          imported++;
        } catch (error) {
          rows[index]!.status = "failed";
          rows[index]!.errors = [error instanceof Error ? error.message : "Could not import this row"];
        }
      }
    }
    const count = (status: ImportRowResult["status"]) => rows.filter((r) => r.status === status).length;
    return {
      entity: request.entity as ImportEntity,
      committed: request.commit,
      total: rows.length,
      valid: request.commit ? imported + count("failed") : count("valid"),
      invalid: count("invalid"),
      duplicates: count("duplicate"),
      imported,
      rows,
    };
  }

  private async checkCustomer(actor: RequestUser, row: Row, seen: Set<string>): Promise<Check> {
    const label = row.name ?? row.phone ?? "(blank row)";
    const type = enumValue(row.type, CUSTOMER_TYPES, "INDIVIDUAL");
    const source = enumValue(row.source, LEAD_SOURCES, "OTHER");
    const problems: string[] = [];
    if (typeof type === "object") problems.push(`type: "${type.invalid}" isn't one of ${CUSTOMER_TYPES.join(", ")}`);
    if (typeof source === "object") problems.push(`source: "${source.invalid}" isn't one of ${LEAD_SOURCES.join(", ")}`);

    const parsed = customerInputSchema.safeParse({
      fullName: row.name ?? "",
      phone: row.phone ?? "",
      altPhone: row.altPhone,
      email: row.email,
      city: row.city,
      state: row.state,
      notes: row.notes,
      tags: row.tags ? row.tags.split(/[;,|]/).map((t) => t.trim()).filter(Boolean) : [],
      type: typeof type === "string" ? type : undefined,
      source: typeof source === "string" ? source : undefined,
    });
    if (!parsed.success) problems.push(...messages(parsed.error));
    if (problems.length || !parsed.success) return { status: "invalid", label, errors: problems };

    const data = parsed.data;
    if (seen.has(data.phone)) return { status: "duplicate", label, errors: ["Repeated in this file"] };
    seen.add(data.phone);
    const existing = await this.customers.findDuplicates(data.phone, data.email);
    if (existing.length) return { status: "duplicate", label, errors: [`Already a customer: ${existing[0]!.fullName} (${existing[0]!.refNo})`] };
    return { status: "valid", label, errors: [], create: () => this.customers.create(actor, data, { allowDuplicate: false }) };
  }

  private checkLead(actor: RequestUser, row: Row, seen: Set<string>): Check {
    const label = row.name ?? row.phone ?? "(blank row)";
    const source = enumValue(row.source, LEAD_SOURCES, "OTHER");
    const productType = enumValue(row.productType, PRODUCT_TYPES, "OTHER");
    const priority = enumValue(row.priority, LEAD_PRIORITIES, "WARM");
    const problems: string[] = [];
    if (typeof source === "object") problems.push(`source: "${source.invalid}" isn't one of ${LEAD_SOURCES.join(", ")}`);
    if (typeof productType === "object") problems.push(`trip type: "${productType.invalid}" isn't one of ${PRODUCT_TYPES.join(", ")}`);
    if (typeof priority === "object") problems.push(`priority: "${priority.invalid}" isn't one of ${LEAD_PRIORITIES.join(", ")}`);

    const parsed = leadInputSchema.safeParse({
      contactName: row.name ?? "",
      phone: row.phone ?? "",
      email: row.email,
      destination: row.destination,
      requirements: row.notes,
      adults: row.adults ? Number(row.adults) : undefined,
      children: row.children ? Number(row.children) : undefined,
      source: typeof source === "string" ? source : undefined,
      productType: typeof productType === "string" ? productType : undefined,
      priority: typeof priority === "string" ? priority : undefined,
      ownerId: null,
    });
    if (!parsed.success) problems.push(...messages(parsed.error));
    if (problems.length || !parsed.success) return { status: "invalid", label, errors: problems };

    if (seen.has(parsed.data.phone)) return { status: "duplicate", label, errors: ["Repeated in this file"] };
    seen.add(parsed.data.phone);
    return { status: "valid", label, errors: [], create: () => this.leads.create(actor, parsed.data) };
  }
}
