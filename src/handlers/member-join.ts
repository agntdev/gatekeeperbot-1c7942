import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { memberName, now, record, state, mute } from "../moderation-state.js";

const composer = new Composer<Ctx>();

async function greet(ctx: Ctx, user: { id: number; first_name?: string; username?: string }): Promise<void> {
  const s = state(ctx); const key = String(user.id);
  const existing = s.members[key];
  const trusted = Boolean(existing?.trusted || existing?.admin || s.settings.trustedUserIds.includes(user.id));
  const joined = now();
  s.members[key] = { userId: user.id, name: user.first_name ?? memberName(ctx), username: user.username, joinedAt: existing?.joinedAt ?? joined, verified: trusted, trusted, admin: Boolean(existing?.admin), muteUntil: trusted ? undefined : joined + s.settings.welcomeTimeoutSeconds * 1000, infractions: existing?.infractions ?? 0 };
  if (trusted) return;
  const expiresAt = joined + s.settings.welcomeTimeoutSeconds * 1000;
  s.challenges[key] = { issuedAt: joined, expiresAt, status: "pending" };
  const muted = await mute(ctx, user.id);
  record(ctx, "mute", muted ? "Verification required" : "Could not mute before verification", user.id);
  await ctx.reply(`${s.settings.welcomeMessage}\n\n${s.settings.rulesText}\n\nTap Verify within three minutes. If that doesn’t work, ask an admin for help.`, { reply_markup: inlineKeyboard([[inlineButton("✅ Verify", "verify:tap"), inlineButton("View rules", "rules:view")]]) });
}

composer.on("message:new_chat_members", async (ctx) => {
  for (const user of ctx.message.new_chat_members) {
    if (!user.is_bot) await greet(ctx, user);
  }
});

export default composer;
