import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now, record, state, isTrusted, mute, remove } from "../moderation-state.js";

const composer = new Composer<Ctx>();
const linkPattern = /(?:https?:\/\/|www\.|t\.me\/)/i;

composer.on("message:text", async (ctx, next) => {
  const userId = ctx.from?.id; const text = ctx.message.text.trim();
  if (!userId || !ctx.chat || isTrusted(ctx, userId)) return next();
  const s = state(ctx); const member = s.members[String(userId)];
  const history = s.messages[String(userId)] ?? []; const current = now();
  const windowStart = current - Math.max(s.settings.identicalRepeatWindowSeconds, s.settings.floodWindowSeconds) * 1000;
  const recent = history.filter((item) => item.at >= windowStart); recent.push({ text, at: current }); s.messages[String(userId)] = recent.slice(-50);
  const same = recent.filter((item) => item.text === text && item.at >= current - s.settings.identicalRepeatWindowSeconds * 1000).length;
  const flood = recent.filter((item) => item.at >= current - s.settings.floodWindowSeconds * 1000).length;
  const accountAgeDays = member ? (current - member.joinedAt) / 86_400_000 : 0;
  const reason = linkPattern.test(text) && accountAgeDays < s.settings.linkAccountAgeDaysThreshold ? "a link from a new account" : same >= s.settings.identicalRepeatThreshold ? "repeated messages" : flood > s.settings.floodThreshold ? "too many messages too quickly" : undefined;
  if (!reason) return next();
  const list = s.infractions[String(userId)] ?? []; list.push({ type: reason, at: current, snapshot: text.slice(0, 240) }); s.infractions[String(userId)] = list.slice(-50);
  if (member) member.infractions = list.length;
  const count = list.length; record(ctx, "warn", reason, userId);
  let action = "a warning";
  if (s.settings.autoEscalationEnabled && count >= 3) { const removed = await remove(ctx, userId, false); action = removed ? "removal" : "a warning"; if (removed) record(ctx, "remove", reason, userId); }
  else if (s.settings.autoEscalationEnabled && count === 2) { const muted = await mute(ctx, userId, current + 600_000); action = muted ? "a 10-minute mute" : "a warning"; if (muted) record(ctx, "mute", reason, userId); }
  await ctx.reply(`We noticed ${reason}, so we applied ${action}. If this was a mistake, please contact an admin.`);
});

export default composer;
