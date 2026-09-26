import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RequirePortalSession } from "@/core/auth/RequirePortalSession";
import { AdminLayout } from "@/portals/admin/AdminLayout";
import { adminRoutes } from "@/portals/admin/registry";
import { B2BLayout } from "@/portals/b2b/B2BLayout";
import { b2bRoutes } from "@/portals/b2b/registry";
import { B2CLayout } from "@/portals/b2c/B2CLayout";
import { CustomerLoginPage } from "@/portals/b2c/CustomerLoginPage";
import { b2cRoutes } from "@/portals/b2c/registry";
import { AdminHome, B2BHome, B2CHome } from "@/portals/homes";
import { PaymentLinkPage } from "@/portals/public/PaymentLinkPage";
import { SharedItineraryPage } from "@/portals/public/SharedItineraryPage";
import { NotFoundPage } from "@/portals/public/TokenPages";
import { ForgotPasswordPage, SetPasswordPage } from "@/portals/shared/PasswordFlows";
import { PasswordLoginPage } from "@/portals/shared/PasswordLoginPage";

const passwordAuthRoutes = (portal: "admin" | "b2b"): RouteObject[] => [
  { path: `/${portal}/login`, element: <PasswordLoginPage portal={portal} /> },
  { path: `/${portal}/forgot-password`, element: <ForgotPasswordPage portal={portal} /> },
  { path: `/${portal}/reset-password`, element: <SetPasswordPage portal={portal} mode="reset" /> },
  { path: `/${portal}/accept-invite`, element: <SetPasswordPage portal={portal} mode="invite" /> },
];

/** Three portals at the root (IMPLEMENTATION_ROADMAP §2.2). Each portal's screens come from its module registry. */
export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/admin" replace /> },

  // ─── Admin ───
  ...passwordAuthRoutes("admin"),
  {
    path: "/admin",
    element: (
      <RequirePortalSession portal="admin">
        <AdminLayout />
      </RequirePortalSession>
    ),
    children: [{ index: true, element: <AdminHome /> }, ...adminRoutes],
  },

  // ─── B2B ───
  ...passwordAuthRoutes("b2b"),
  {
    path: "/b2b",
    element: (
      <RequirePortalSession portal="b2b">
        <B2BLayout />
      </RequirePortalSession>
    ),
    children: [{ index: true, element: <B2BHome /> }, ...b2bRoutes],
  },

  // ─── B2C ───
  { path: "/b2c/login", element: <CustomerLoginPage /> },
  {
    path: "/b2c",
    element: (
      <RequirePortalSession portal="b2c">
        <B2CLayout />
      </RequirePortalSession>
    ),
    children: [{ index: true, element: <B2CHome /> }, ...b2cRoutes],
  },

  // ─── Public token pages ───
  { path: "/i/:token", element: <SharedItineraryPage /> },
  { path: "/pay/:token", element: <PaymentLinkPage /> },

  { path: "*", element: <NotFoundPage /> },
]);
