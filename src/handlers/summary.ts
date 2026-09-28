import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { now, record, state } from "../moderation-state.js";

registerMainMenuItem({ label: "📊 Daily summary", data: "summary:run", order: 90 });
const composer = new Composer<Ctx>();
composer.command("summary", async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  const entries = state(ctx).actions.filter((a) => a.at >= now() - 86_400_000); const count = (a: string) => entries.filter((entry) => entry.action === a).length;
  await ctx.reply(`Last 24 hours\n\nVerified: ${count("verify")}\nWarnings: ${count("warn")}\nMutes: ${count("mute")}\nRemovals: ${count("remove")}`);
});
composer.callbackQuery("summary:run", async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx))) return;
  const since = now() - 86_400_000; const entries = state(ctx).actions.filter((a) => a.at >= since);
  const count = (action: string) => entries.filter((a) => a.action === action).length;
  const text = `Last 24 hours\n\nVerified: ${count("verify")}\nWarnings: ${count("warn")}\nMutes: ${count("mute")}\nRemovals: ${count("remove")}`;
  record(ctx, "setting_change", "Daily summary generated"); await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) });
  const admin = adminChatId(ctx as unknown as { env?: Record<string, unknown> }); if (admin && String(ctx.chat?.id) !== admin) { try { await ctx.api.sendMessage(admin, text); } catch { /* a blocked admin must not break the group summary */ } }
});
export default composer;
