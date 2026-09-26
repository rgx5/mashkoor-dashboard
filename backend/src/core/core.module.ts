import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit/audit.service";
import { AppConfig } from "./config/app-config.service";
import { FieldEncryptionService } from "./crypto/field-encryption.service";
import { MailService } from "./mail/mail.service";
import { SequenceService } from "./numbering/sequence.service";
import { PrismaService } from "./prisma/prisma.service";
import { AbilityFactory } from "./rbac/ability.factory";
import { SettingsService } from "./settings/settings.service";
import { StorageService } from "./storage/storage.service";
import { WebsiteRevalidator } from "./site/website-revalidator.service";

const providers = [AppConfig, PrismaService, AuditService, MailService, AbilityFactory, SequenceService, FieldEncryptionService, SettingsService, WebsiteRevalidator, StorageService];

/** Infrastructure shared by every business module. */
@Global()
@Module({ providers, exports: providers })
export class CoreModule {}
