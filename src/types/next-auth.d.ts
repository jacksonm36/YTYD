import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      username?: string;
      role?: string;
      locale?: string;
    };
  }

  interface User {
    locale?: string;
    username?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    locale?: string;
    username?: string;
    role?: string;
    tokenVersion?: number;
    authTime?: number;
  }
}
