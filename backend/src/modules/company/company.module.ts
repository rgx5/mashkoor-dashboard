import { Module } from "@nestjs/common";
import { AdminCompanyController } from "./admin-company.controller";
import { CompanyService } from "./company.service";

@Module({ controllers: [AdminCompanyController], providers: [CompanyService], exports: [CompanyService] })
export class CompanyModule {}
