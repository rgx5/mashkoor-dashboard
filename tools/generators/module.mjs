#!/usr/bin/env node
// Scaffolds a business module in backend + frontend following IMPLEMENTATION_ROADMAP §2.3.
// Usage: pnpm gen:module leads [--portals admin,b2b,b2c]

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [name, ...rest] = process.argv.slice(2);
if (!name || !/^[a-z][a-z-]*$/.test(name)) {
  console.error("Usage: pnpm gen:module <kebab-name> [--portals admin,b2b,b2c]");
  process.exit(1);
}
const portalsArg = rest.includes("--portals") ? rest[rest.indexOf("--portals") + 1] : "admin";
const portals = portalsArg.split(",").filter((p) => ["admin", "b2b", "b2c"].includes(p));

const pascal = name.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
const camel = pascal[0].toLowerCase() + pascal.slice(1);

const files = {};

// ─── Backend ───
const be = `backend/src/modules/${name}`;
files[`${be}/domain/${name}.service.ts`] = `import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";

/** Business logic for ${pascal}. Shared by every portal controller. */
@Injectable()
export class ${pascal}Service {
  constructor(private readonly prisma: PrismaService) {}
}
`;
for (const portal of portals) {
  const P = portal[0].toUpperCase() + portal.slice(1);
  files[`${be}/${portal}/${portal}-${name}.controller.ts`] = `import { Get } from "@nestjs/common";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ${pascal}Service } from "../domain/${name}.service";

/** /api/v1/${portal}/${name} */
@PortalController("${portal}", "${name}")
export class ${P}${pascal}Controller {
  constructor(private readonly service: ${pascal}Service) {}

  @Get()
  list(@CurrentUser() _actor: RequestUser) {
    return { data: [], meta: { page: 1, pageSize: 25, total: 0 } };
  }
}
`;
}
files[`${be}/${name}.module.ts`] = `import { Module } from "@nestjs/common";
${portals.map((p) => `import { ${p[0].toUpperCase() + p.slice(1)}${pascal}Controller } from "./${p}/${p}-${name}.controller";`).join("\n")}
import { ${pascal}Service } from "./domain/${name}.service";

@Module({
  controllers: [${portals.map((p) => `${p[0].toUpperCase() + p.slice(1)}${pascal}Controller`).join(", ")}],
  providers: [${pascal}Service],
  exports: [${pascal}Service],
})
export class ${pascal}Module {}
`;

// ─── Frontend ───
const fe = `frontend/src/modules/${name}`;
for (const portal of portals) {
  files[`${fe}/${portal}/${pascal}Page.tsx`] = `import { PageHeader } from "@/core/ui/layout";

export function ${pascal}Page() {
  return <PageHeader title="${pascal}" description="TODO" />;
}
`;
}
files[`${fe}/index.ts`] = `import { Folder } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export const ${camel}Module: AppModule = {
  id: "${name}",
${portals
  .map(
    (p) => `  ${p}: {
    nav: [{ label: "${pascal}", to: "${name}", icon: Folder }],
    routes: [{ path: "${name}", lazy: async () => ({ Component: (await import("./${p}/${pascal}Page")).${pascal}Page }) }],
  },`,
  )
  .join("\n")}
};
`;

for (const [path, content] of Object.entries(files)) {
  const full = join(root, path);
  if (existsSync(full)) {
    console.log(`skip   ${path} (exists)`);
    continue;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log(`create ${path}`);
}

console.log(`\nNext steps:
  1. Import ${pascal}Module in backend/src/app.module.ts
  2. Add ${camel}Module to ${portals.map((p) => `frontend/src/portals/${p}/registry.ts`).join(", ")}
  3. Add Prisma models, CASL subjects (core/rbac/ability.factory.ts) and shared Zod schemas`);
