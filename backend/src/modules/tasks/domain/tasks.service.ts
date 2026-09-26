import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { subject } from "@casl/ability";
import type { Paginated, Task as TaskDto, TaskData, TaskListQuery, TaskUpdateData } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { paginate, toIso, userRef, userRefSelect } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const include = {
  assignee: userRefSelect,
  lead: { select: { id: true, refNo: true, contactName: true } },
  customer: { select: { id: true, refNo: true, fullName: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRefs = Prisma.TaskGetPayload<{ include: typeof include }>;

const toDto = (t: TaskWithRefs): TaskDto => ({
  id: t.id,
  title: t.title,
  description: t.description,
  dueAt: toIso(t.dueAt)!,
  status: t.status,
  priority: t.priority,
  assignee: userRef(t.assignee)!,
  lead: t.lead,
  customer: t.customer,
  completedAt: toIso(t.completedAt),
  createdAt: toIso(t.createdAt)!,
});

/** Start and end of "today" in India Standard Time, as UTC instants. */
function istDayBounds(now = new Date()) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  return { start: new Date(startUtc), end: new Date(startUtc + 24 * 60 * 60 * 1000) };
}

/** M03 · Follow-up tasks. */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: TaskListQuery): Promise<Paginated<TaskDto> & { counts: { overdue: number; today: number; upcoming: number } }> {
    const ability = this.abilities.forUser(actor);
    const { start, end } = istDayBounds();

    const assigneeFilter: Prisma.TaskWhereInput =
      query.assignee === "all" ? {} : { assigneeId: query.assignee === "me" ? actor.id : query.assignee };

    const base: Prisma.TaskWhereInput = {
      AND: [
        accessibleBy(ability).Task,
        assigneeFilter,
        query.leadId ? { leadId: query.leadId } : {},
        query.customerId ? { customerId: query.customerId } : {},
      ],
    };

    const dueFilter: Record<TaskListQuery["due"], Prisma.TaskWhereInput> = {
      overdue: { dueAt: { lt: start } },
      today: { dueAt: { gte: start, lt: end } },
      upcoming: { dueAt: { gte: end } },
      all: {},
    };

    const where: Prisma.TaskWhereInput = { AND: [base, { status: query.status }, dueFilter[query.due]] };
    const openBase: Prisma.TaskWhereInput = { AND: [base, { status: "OPEN" }] };

    const [rows, total, overdue, today, upcoming] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where, include, orderBy: [{ dueAt: "asc" }], ...paginate(query.page, query.pageSize) }),
      this.prisma.task.count({ where }),
      this.prisma.task.count({ where: { AND: [openBase, dueFilter.overdue] } }),
      this.prisma.task.count({ where: { AND: [openBase, dueFilter.today] } }),
      this.prisma.task.count({ where: { AND: [openBase, dueFilter.upcoming] } }),
    ]);

    return { data: rows.map(toDto), meta: { page: query.page, pageSize: query.pageSize, total }, counts: { overdue, today, upcoming } };
  }

  async create(actor: RequestUser, input: TaskData): Promise<TaskDto> {
    const ability = this.abilities.forUser(actor);
    const assigneeId = input.assigneeId ?? actor.id;
    if (assigneeId !== actor.id && !ability.can("manage", "Task")) {
      throw AppError.forbidden("You can only create tasks for yourself");
    }

    const assignee = await this.prisma.user.findFirst({ where: { id: assigneeId, type: "STAFF", status: "ACTIVE" } });
    if (!assignee) throw AppError.notFound("Assignee");

    let customerId = input.customerId ?? null;
    if (input.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: input.leadId } });
      if (!lead) throw AppError.notFound("Lead");
      if (!ability.can("read", subject("Lead", lead))) throw AppError.forbidden();
      customerId ??= lead.customerId;
    }

    const task = await this.prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        dueAt: new Date(input.dueAt),
        priority: input.priority,
        assigneeId,
        leadId: input.leadId ?? null,
        customerId,
        createdById: actor.id,
      },
      include,
    });
    return toDto(task);
  }

  async update(actor: RequestUser, id: string, input: TaskUpdateData): Promise<TaskDto> {
    const ability = this.abilities.forUser(actor);
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Task");
    if (!ability.can("update", subject("Task", existing))) throw AppError.forbidden();
    if (input.assigneeId && input.assigneeId !== existing.assigneeId && !ability.can("manage", "Task")) {
      throw AppError.forbidden("Only managers can reassign tasks");
    }

    const status = input.status ?? existing.status;
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        priority: input.priority,
        assigneeId: input.assigneeId,
        status,
        completedAt: status === "DONE" ? (existing.completedAt ?? new Date()) : null,
      },
      include,
    });
    if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "task.reassigned", entityType: "Task", entityId: id, before: { assigneeId: existing.assigneeId }, after: { assigneeId: input.assigneeId } });
    }
    return toDto(task);
  }
}
