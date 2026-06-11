import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import authConfig from "../auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login"];
const DEFAULT_ALLOWED_COUNTRIES = ["AR"];
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const INTERNAL_LIQUIDACION_JOB_RUN_ROUTE = /^\/api\/liquidaciones\/regeneracion-jobs\/[^/]+\/run$/;
const SCANNER_PATH_PATTERNS = [
  /^\/wp-admin(?:\/|$)/i,
  /^\/wp-login\.php$/i,
  /^\/xmlrpc\.php$/i,
  /^\/phpmyadmin(?:\/|$)/i,
  /^\/\.env(?:$|[./])/i,
  /\.php(?:\/|$)/i,
];

function isTrafficGuardEnabled() {
  return TRUE_VALUES.has((process.env.TRAFFIC_GUARD_ENABLED ?? "").trim().toLowerCase());
}

function getAllowedCountries() {
  const raw = process.env.TRAFFIC_GUARD_ALLOWED_COUNTRIES?.trim();
  if (!raw) {
    return DEFAULT_ALLOWED_COUNTRIES;
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_COUNTRIES;
}

function getRequestCountry(req: NextRequest) {
  return (
    req.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ||
    req.headers.get("cf-ipcountry")?.trim().toUpperCase() ||
    null
  );
}

function getRequestIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return req.headers.get("x-real-ip")?.trim() || null;
}

function hasTrafficGuardBypass(req: NextRequest) {
  const expected = process.env.TRAFFIC_GUARD_SECRET?.trim();
  if (!expected) {
    return false;
  }

  const headerSecret = req.headers.get("x-traffic-guard-secret")?.trim();
  const querySecret = req.nextUrl.searchParams.get("traffic_guard_secret")?.trim();

  return headerSecret === expected || querySecret === expected;
}

function isScannerPath(pathname: string) {
  return SCANNER_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isTrafficGuardExemptPath(pathname: string) {
  return (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/email/respuestas") ||
    INTERNAL_LIQUIDACION_JOB_RUN_ROUTE.test(pathname) ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function logBlockedRequest(req: NextRequest, reason: string, country: string | null) {
  console.warn("[traffic-guard] blocked request", {
    reason,
    country: country ?? "UNKNOWN",
    ip: getRequestIp(req),
    method: req.method,
    path: req.nextUrl.pathname,
    userAgent: req.headers.get("user-agent") ?? "UNKNOWN",
  });
}

function buildForbiddenResponse() {
  return new NextResponse("Forbidden", {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    INTERNAL_LIQUIDACION_JOB_RUN_ROUTE.test(pathname) ||
    pathname.startsWith("/api/email/respuestas") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/chromium-pack.tar" ||
    pathname.startsWith("/branding") ||
    pathname.startsWith("/uploads") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/favicon.ico"
  );
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  if (isScannerPath(pathname)) {
    logBlockedRequest(req, "scanner-path", getRequestCountry(req));
    return buildForbiddenResponse();
  }

  if (
    isTrafficGuardEnabled() &&
    !isTrafficGuardExemptPath(pathname) &&
    !hasTrafficGuardBypass(req)
  ) {
    const country = getRequestCountry(req);
    const allowedCountries = getAllowedCountries();

    if (!country || !allowedCountries.includes(country)) {
      logBlockedRequest(req, "country-block", country);
      return buildForbiddenResponse();
    }
  }

  const publicPath = isPublicPath(pathname);
  const hasSession = Boolean(req.auth?.user);

  if (!hasSession && !publicPath) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
