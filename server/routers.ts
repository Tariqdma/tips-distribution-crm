import { COOKIE_NAME } from "../shared/const.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  team: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getOrCreateCrmProfile(ctx.user.id, ctx.user.role === "admin");
      return {
        userId: ctx.user.id,
        name: ctx.user.name,
        systemRole: ctx.user.role,
        crmRole: profile?.crmRole ?? (ctx.user.role === "admin" ? "manager" : "sales_rep"),
        territory: profile?.territory ?? "غير معين",
      };
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
      return db.listCrmMembers();
    }),
    updateRole: protectedProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["manager", "sales_rep", "medical_rep"]), territory: z.string().min(1).max(255).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
        return db.updateCrmMemberRole(input.userId, input.role, input.territory);
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
