import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "coder";
      isChiefCoder: boolean;
      datasetScope: "live" | "test" | "training";
    } & DefaultSession["user"];
  }

  interface User {
    role: "admin" | "coder";
    isChiefCoder: boolean;
    datasetScope: "live" | "test" | "training";
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: "admin" | "coder";
    isChiefCoder: boolean;
    datasetScope: "live" | "test" | "training";
  }
}
