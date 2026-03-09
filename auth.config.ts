import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { isGlobalRole } from "./src/lib/roles";

const authSecret = process.env.AUTH_SECRET;
const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;

if (!authSecret) {
  throw new Error("AUTH_SECRET no esta configurado");
}

if (!googleClientId || !googleClientSecret) {
  throw new Error("AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET son obligatorios");
}

const authConfig = {
  pages: { signIn: "/login" },
  secret: authSecret,
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const userWithRole = user as typeof user & { role?: string; activo?: boolean };

        token.id = user.id;
        token.role = isGlobalRole(userWithRole.role ?? "") ? userWithRole.role : "USER";
        token.activo = typeof userWithRole.activo === "boolean" ? userWithRole.activo : true;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = isGlobalRole(String(token.role ?? "")) ? (String(token.role) as "SUPER_ADMIN" | "USER") : "USER";
        session.user.activo = token.activo !== false;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
