import type { DefaultSession } from "next-auth";

import type { GlobalRole, ConsorcioRole } from "../lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: GlobalRole;
      activo: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: GlobalRole;
    activo: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: GlobalRole;
    activo?: boolean;
    consorcioRoles?: Array<{ consorcioId: number; role: ConsorcioRole }>;
  }
}
