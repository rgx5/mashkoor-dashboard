import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AppConfig } from "./core/config/app-config.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get("CORS_ORIGINS"), credentials: true });
  app.getHttpAdapter().getInstance().set("trust proxy", config.get("TRUST_PROXY_HOPS"));
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("Mashkoor Platform API").setVersion("1.0").addBearerAuth().build(),
    );
    SwaggerModule.setup("api/docs", app, document, { jsonDocumentUrl: "api/docs.json" });
  }

  await app.listen(config.get("PORT"));
}

void bootstrap();
