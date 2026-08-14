import { COOKIE_NAME } from "../shared/const.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { sendInvitationEmail } from "./invite-email";

async function requireCrmManager(user: { id: number; role: "user" | "admin" }) {
  if (user.role === "admin") return;
  const profile = await db.getOrCreateCrmProfile(user.id, false);
  if (profile?.crmRole !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
}

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
  crmInviteEmail: router({
    send: publicProcedure
      .input(z.object({ inviteId: z.string().uuid(), supabaseAccessToken: z.string().min(20) }))
      .mutation(({ input }) => sendInvitationEmail(input)),
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
      await requireCrmManager(ctx.user);
      return db.listCrmMembers();
    }),
    updateRole: protectedProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["manager", "sales_rep", "medical_rep"]), territory: z.string().min(1).max(255).optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireCrmManager(ctx.user);
        return db.updateCrmMemberRole(input.userId, input.role, input.territory);
      }),
    invites: protectedProcedure.query(async ({ ctx }) => {
      await requireCrmManager(ctx.user);
      return db.listCrmInvites();
    }),
    createInvite: protectedProcedure
      .input(z.object({ email: z.string().email(), role: z.enum(["manager", "sales_rep", "medical_rep"]), territory: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        await requireCrmManager(ctx.user);
        return db.createCrmInvite({ email: input.email, crmRole: input.role, territory: input.territory, invitedByUserId: ctx.user.id });
      }),
  }),
  territories: router({
    listBoundaries: protectedProcedure.query(async ({ ctx }) => {
      await requireCrmManager(ctx.user);
      return db.listTerritoryBoundaries();
    }),
    saveBoundary: protectedProcedure
      .input(z.object({ territoryId: z.string().min(1).max(96), name: z.string().min(1).max(255), state: z.string().min(1).max(255), city: z.string().min(1).max(255), centerLatitude: z.string().regex(/^-?\d+(\.\d+)?$/), centerLongitude: z.string().regex(/^-?\d+(\.\d+)?$/), radiusMeters: z.number().int().positive().max(100000), boundaryNotes: z.string().max(2000).optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireCrmManager(ctx.user);
        return db.upsertTerritoryBoundary({ ...input, updatedByUserId: ctx.user.id });
      }),
  }),
  operations: router({
    notifications: protectedProcedure.query(({ ctx }) => db.listCentralNotifications(ctx.user.id)),
    createNotification: protectedProcedure
      .input(z.object({ recipientUserId: z.number().int().positive().optional(), title: z.string().min(1).max(255), body: z.string().min(1).max(3000), kind: z.enum(["plan", "visit", "alert", "team"]) }))
      .mutation(async ({ ctx, input }) => {
        await requireCrmManager(ctx.user);
        await db.createCentralNotification({ ...input, createdByUserId: ctx.user.id });
        return { success: true };
      }),
  }),
  tracking: router({
    record: protectedProcedure
      .input(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracyMeters: z.number().nonnegative().max(100000).optional(), speedMetersPerSecond: z.number().nonnegative().max(300).optional(), source: z.enum(["foreground", "background"]), capturedAt: z.coerce.date() }))
      .mutation(async ({ ctx, input }) => {
        await db.recordDutyLocation({ userId: ctx.user.id, latitude: String(input.latitude), longitude: String(input.longitude), accuracyMeters: input.accuracyMeters ? Math.round(input.accuracyMeters) : undefined, speedMetersPerSecond: input.speedMetersPerSecond?.toFixed(2), source: input.source, capturedAt: input.capturedAt });
        return { success: true };
      }),
    mineToday: protectedProcedure.query(({ ctx }) => db.getMyDutyRoute(ctx.user.id, new Date(new Date().setHours(0, 0, 0, 0)))),
    live: protectedProcedure.query(async ({ ctx }) => {
      await requireCrmManager(ctx.user);
      return db.getLiveDutyLocations(new Date(Date.now() - 15 * 60 * 1000));
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
