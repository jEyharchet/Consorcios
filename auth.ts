import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import authConfig from "./auth.config";
import { ensureUserPersona, normalizeEmailIdentity } from "./src/lib/persona-identity";
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

      const normalizedEmail = normalizeEmailIdentity(user.email);
      if (!normalizedEmail) {
        return false;
      }

      const dbUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
        },
        select: { id: true, activo: true },
      });

      if (dbUser?.id) {
        await ensureUserPersona(
          {
            userId: dbUser.id,
            email: normalizedEmail,
            name: user.name,
            createIfMissing: true,
          },
          prisma,
        );
      }

      return dbUser ? dbUser.activo : true;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) {
        return;
      }

      const userId = user.id;
      const totalUsers = await prisma.user.count();
      const role: GlobalRole = totalUsers === 1 ? "SUPER_ADMIN" : "USER";

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            role,
            email: normalizeEmailIdentity(user.email),
          },
        });

        await ensureUserPersona(
          {
            userId,
            email: user.email,
            name: user.name,
            createIfMissing: true,
          },
          tx,
        );
      });
    },
  },
  logger: {
    error(error) {
      console.error("[auth][error]", error);
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
  },
});

