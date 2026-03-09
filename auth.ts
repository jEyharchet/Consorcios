import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import authConfig from "./auth.config";
import { prisma } from "./src/lib/prisma";
import { type GlobalRole } from "./src/lib/roles";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
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
});
