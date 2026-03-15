import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "../auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login"];

const INTERNAL_LIQUIDACION_JOB_RUN_ROUTE = /^\/api\/liquidaciones\/regeneracion-jobs\/[^/]+\/run$/;

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    INTERNAL_LIQUIDACION_JOB_RUN_ROUTE.test(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/branding") ||
    pathname.startsWith("/uploads") ||
    pathname === "/favicon.ico"
  );
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const publicPath = isPublicPath(pathname);
  const hasSession = Boolean(req.auth?.user);

  if (!hasSession && !publicPath) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|branding).*)"],
};
