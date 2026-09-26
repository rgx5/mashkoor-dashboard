import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  PORTALS,
  resetPasswordSchema,
  type AcceptInviteInput,
  type LoginInput,
  type OtpVerifyInput,
  type Portal,
  type ResetPasswordInput,
} from "@mashkoor/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { AppConfig } from "../config/app-config.service";
import { AppError } from "../http/app-error";
import { ZodPipe } from "../http/zod.pipe";
import { AuthService, type IssuedSession } from "./auth.service";
import { CurrentUser, PortalFromParam, Public } from "./decorators";
import type { RequestUser } from "./request-user";
import type { ClientInfo } from "./token.service";

const passwordPortal = new ZodPipe(z.enum(["admin", "b2b"]));
const anyPortal = new ZodPipe(z.enum(PORTALS));
const cookieName = (portal: Portal) => `mk_rt_${portal}`;
const CLIENT_HEADER = "x-mashkoor-client";

const clientInfo = (req: Request): ClientInfo => ({ ip: req.ip, userAgent: req.headers["user-agent"] });

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":portal/login")
  @HttpCode(200)
  async login(
    @Param("portal", passwordPortal) portal: "admin" | "b2b",
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(portal, await this.auth.login(portal, body, clientInfo(req)), res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("b2c/otp/request")
  @HttpCode(200)
  async requestOtp(@Body(new ZodPipe(otpRequestSchema)) body: { email: string }) {
    await this.auth.requestOtp(body.email);
    return { message: "If an account exists for this email, a sign-in code has been sent." };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("b2c/otp/verify")
  @HttpCode(200)
  async verifyOtp(@Body(new ZodPipe(otpVerifySchema)) body: OtpVerifyInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond("b2c", await this.auth.verifyOtp(body, clientInfo(req)), res);
  }

  @Public()
  @Post(":portal/refresh")
  @HttpCode(200)
  async refresh(@Param("portal", anyPortal) portal: Portal, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Custom header blocks cross-site form posts (defence in depth alongside SameSite=Strict).
    if (req.headers[CLIENT_HEADER] !== "web") throw AppError.unauthenticated();
    try {
      return this.respond(portal, await this.auth.refresh(portal, req.cookies?.[cookieName(portal)], clientInfo(req)), res);
    } catch (error) {
      this.clearCookie(portal, res);
      throw error;
    }
  }

  @Public()
  @Post(":portal/logout")
  @HttpCode(204)
  async logout(@Param("portal", anyPortal) portal: Portal, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[cookieName(portal)]);
    this.clearCookie(portal, res);
  }

  @PortalFromParam()
  @Get(":portal/me")
  me(@Param("portal", anyPortal) _portal: Portal, @CurrentUser() user: RequestUser) {
    return this.auth.me(user);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(":portal/forgot-password")
  @HttpCode(200)
  async forgotPassword(@Param("portal", passwordPortal) portal: "admin" | "b2b", @Body(new ZodPipe(forgotPasswordSchema)) body: { email: string }) {
    await this.auth.forgotPassword(portal, body.email);
    return { message: "If an account exists for this email, a reset link has been sent." };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.auth.resetPassword(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("accept-invite")
  @HttpCode(200)
  acceptInvite(@Body(new ZodPipe(acceptInviteSchema)) body: AcceptInviteInput) {
    return this.auth.acceptInvite(body);
  }

  /** Refresh token goes in an httpOnly cookie scoped to this portal's auth path; access token in the body. */
  private respond(portal: Portal, session: IssuedSession, res: Response) {
    const { refreshToken, ...body } = session;
    res.cookie(cookieName(portal), refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: "strict",
      path: `/api/v1/auth/${portal}`,
      maxAge: this.config.get("REFRESH_TOKEN_TTL_DAYS") * 24 * 60 * 60 * 1000,
    });
    return body;
  }

  private clearCookie(portal: Portal, res: Response) {
    res.clearCookie(cookieName(portal), { path: `/api/v1/auth/${portal}` });
  }
}
