import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { memberName, now, record, state, unmute } from "../moderation-state.js";

registerMainMenuItem({ label: "✅ Verify", data: "verify:tap", order: 10 });
const composer = new Composer<Ctx>();

composer.callbackQuery("verify:tap", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const s = state(ctx); const m = s.members[String(userId)];
  if (m?.verified) { await ctx.reply("You’re already verified. You’re all set!"); return; }
  const challenge = s.challenges[String(userId)];
  if (challenge && challenge.expiresAt < now()) { challenge.status = "expired"; await ctx.reply("That verification window ended. Ask an admin to let you back in."); return; }
  if (!m) s.members[String(userId)] = { userId, name: memberName(ctx), joinedAt: now(), verified: true, trusted: false, admin: false, infractions: 0 };
  else m.verified = true;
  if (challenge) challenge.status = "verified";
  await unmute(ctx, userId); record(ctx, "verify", "Member completed verification", userId);
  await ctx.reply("You’re verified — welcome in!", { reply_markup: inlineKeyboard([[inlineButton("View rules", "rules:view")]]) });
});

export default composer;
