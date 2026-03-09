import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { isGlobalRole } from "./src/lib/roles";

const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
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
        session.user.role = isGlobalRole(String(token.role ?? "")) ? String(token.role) : "USER";
        session.user.activo = token.activo !== false;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
