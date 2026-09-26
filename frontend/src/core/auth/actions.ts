import type { AuthSession, LoginInput, MeResponse, OtpVerifyInput, Portal } from "@mashkoor/shared";
import { authApi } from "../api/client";
import { queryClient } from "../api/query-client";
import { sessionStore } from "./session-store";

async function completeSignIn(portal: Portal, session: AuthSession) {
  sessionStore.setSession(portal, session);
  const me = await authApi(portal).get<MeResponse>("/me");
  sessionStore.setMe(portal, me);
}

export async function signInWithPassword(portal: "admin" | "b2b", input: LoginInput) {
  await completeSignIn(portal, await authApi(portal).post<AuthSession>("/login", input));
}

export const requestCustomerCode = (email: string) => authApi("b2c").post<{ message: string }>("/otp/request", { email });

export async function signInWithCode(input: OtpVerifyInput) {
  await completeSignIn("b2c", await authApi("b2c").post<AuthSession>("/otp/verify", input));
}

export async function signOut(portal: Portal) {
  try {
    await fetch(`/api/v1/auth/${portal}/logout`, { method: "POST", credentials: "same-origin" });
  } finally {
    sessionStore.clear(portal);
    queryClient.removeQueries({ queryKey: [portal] });
  }
}
