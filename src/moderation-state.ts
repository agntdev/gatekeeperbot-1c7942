import type { Ctx } from "./bot.js";

export type ModerationAction = "warn" | "mute" | "kick" | "ban" | "verify" | "remove" | "setting_change";
export interface MemberRecord { userId: number; name: string; username?: string; joinedAt: number; verified: boolean; trusted: boolean; admin: boolean; muteUntil?: number; infractions: number; }
export interface Infraction { type: string; at: number; snapshot: string; }
export interface ActionEntry { id: string; actorId: number | "system"; targetId?: number; action: ModerationAction; reason: string; at: number; }
export interface Settings {
  welcomeMessage: string; rulesText: string; welcomeTimeoutSeconds: number;
  linkAccountAgeDaysThreshold: number; identicalRepeatThreshold: number; identicalRepeatWindowSeconds: number;
  floodThreshold: number; floodWindowSeconds: number; autoEscalationEnabled: boolean; trustedUserIds: number[];
}
export interface GatekeeperState {
  settings: Settings; members: Record<string, MemberRecord>; infractions: Record<string, Infraction[]>;
  actions: ActionEntry[]; messages: Record<string, { text: string; at: number }[]>; challenges: Record<string, { issuedAt: number; expiresAt: number; status: "pending" | "verified" | "expired" }>;
  sequence: number;
}

export const DEFAULT_SETTINGS: Settings = {
  welcomeMessage: "Welcome! You’re muted for a moment while we check that you’re real.",
  rulesText: "Be kind, keep things on topic, and don’t post spam or harmful links.",
  welcomeTimeoutSeconds: 180, linkAccountAgeDaysThreshold: 7, identicalRepeatThreshold: 3,
  identicalRepeatWindowSeconds: 60, floodThreshold: 5, floodWindowSeconds: 10,
  autoEscalationEnabled: true, trustedUserIds: [],
};

// One clock seam keeps expiry and rolling-window behavior testable.
let clock: () => number = () => Date.now();
export const now = () => clock();
export function setModerationClock(value: (() => number) | undefined): void { clock = value ?? (() => Date.now()); }

export function state(ctx: Ctx): GatekeeperState {
  const s = ctx.session.gatekeeper;
  if (s) return s;
  const created: GatekeeperState = { settings: { ...DEFAULT_SETTINGS, trustedUserIds: [] }, members: {}, infractions: {}, actions: [], messages: {}, challenges: {}, sequence: 0 };
  ctx.session.gatekeeper = created;
  return created;
}
export function record(ctx: Ctx, action: ModerationAction, reason: string, targetId?: number): void {
  const s = state(ctx); s.sequence += 1;
  s.actions.push({ id: String(s.sequence), actorId: ctx.from?.id ?? "system", targetId, action, reason, at: now() });
  if (s.actions.length > 500) s.actions.splice(0, s.actions.length - 500);
}
export function memberName(ctx: Ctx): string { return ctx.from?.first_name ?? "member"; }
export function isTrusted(ctx: Ctx, userId: number): boolean {
  const m = state(ctx).members[String(userId)]; return Boolean(m?.trusted || m?.admin || state(ctx).settings.trustedUserIds.includes(userId));
}
export function trimText(value: string, max = 3900): string { return value.length > max ? value.slice(0, max - 1) + "…" : value; }

export async function mute(ctx: Ctx, userId: number, until?: number): Promise<boolean> {
  if (!ctx.chat) return false;
  try { await ctx.api.restrictChatMember(ctx.chat.id, userId, { can_send_messages: false }, until ? { until_date: Math.floor(until / 1000) } : undefined); return true; } catch { return false; }
}
export async function unmute(ctx: Ctx, userId: number): Promise<boolean> {
  if (!ctx.chat) return false;
  try { await ctx.api.restrictChatMember(ctx.chat.id, userId, { can_send_messages: true, can_send_audios: true, can_send_documents: true, can_send_photos: true, can_send_videos: true, can_send_video_notes: true, can_send_voice_notes: true, can_send_polls: true, can_add_web_page_previews: true, can_change_info: false, can_invite_users: true, can_pin_messages: false, can_manage_topics: false }); return true; } catch { return false; }
}
export async function remove(ctx: Ctx, userId: number, ban: boolean): Promise<boolean> {
  if (!ctx.chat) return false;
  try { if (ban) await ctx.api.banChatMember(ctx.chat.id, userId); else { await ctx.api.banChatMember(ctx.chat.id, userId); await ctx.api.unbanChatMember(ctx.chat.id, userId, { only_if_banned: true }); } return true; } catch { return false; }
}
