import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import authConfig from "./auth.config";
import { prisma } from "./src/lib/prisma";
import { type GlobalRole } from "./src/lib/roles";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { activo: true },
      });

      return dbUser ? dbUser.activo : true;
    },
  },
  events: {
    async createUser({ user }) {
      const totalUsers = await prisma.user.count();
      const role: GlobalRole = totalUsers === 1 ? "SUPER_ADMIN" : "USER";

      await prisma.user.update({
        where: { id: user.id },
        data: { role },
      });
    },
  },
  logger: {
    error(code, metadata) {
      console.error("[auth][error]", code, metadata ?? {});
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
  },
});
