import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { randomToken } from "../../../core/auth/crypto";
import { AppConfig } from "../../../core/config/app-config.service";

/** The message a gateway posts to our webhook when a payment succeeds or fails. */
export interface GatewayEvent {
  eventId: string;
  type: "payment.captured" | "payment.failed";
  orderId: string;
  paymentId: string;
  /** Rupees. */
  amount: number;
  method: string;
}

/** What the rest of the app needs from a payment gateway. A real adapter (Razorpay, PayU…) implements the same shape. */
export interface PaymentGateway {
  readonly name: "mock";
  createOrder(input: { amount: number; reference: string }): Promise<{ orderId: string }>;
  /** True only if `signature` proves the event came from the gateway. */
  verify(event: GatewayEvent, signature: string): boolean;
}

/**
 * Stand-in gateway for development and demos — no money moves. It behaves like a real one: an order is created,
 * then a *signed* event is delivered to the webhook, and only that webhook credits the booking. Swapping in a real
 * gateway means replacing this class and the signature check, not the payment-link or booking code.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = "mock" as const;

  constructor(private readonly config: AppConfig) {}

  /** The mock never runs in production: its webhook secret is a development value, so enabling it would let anyone forge "paid" events. */
  get enabled() {
    return !this.config.isProduction;
  }

  async createOrder(_input: { amount: number; reference: string }) {
    return { orderId: `mock_order_${randomToken(9)}` };
  }

  /** Only the mock "gateway" itself (and its tests) needs to produce signatures. */
  sign(event: GatewayEvent): string {
    return createHmac("sha256", this.config.get("MOCK_GATEWAY_SECRET")).update(this.canonical(event)).digest("hex");
  }

  verify(event: GatewayEvent, signature: string): boolean {
    if (!this.enabled) return false;
    const expected = Buffer.from(this.sign(event), "hex");
    const given = Buffer.from(signature ?? "", "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  newEvent(type: GatewayEvent["type"], orderId: string, amount: number, method: string): GatewayEvent {
    return { eventId: `evt_${randomToken(9)}`, type, orderId, paymentId: `mock_pay_${randomToken(9)}`, amount, method };
  }

  private canonical(e: GatewayEvent) {
    return [e.eventId, e.type, e.orderId, e.paymentId, e.amount, e.method].join("|");
  }
}
