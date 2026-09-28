import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { state, trimText } from "../moderation-state.js";

const composer = new Composer<Ctx>();

async function show(ctx: Ctx, page = 0): Promise<void> {
  if (!(await requireOwner(ctx))) return;
  const all = [...state(ctx).actions].reverse(); const size = 10; const pages = Math.max(1, Math.ceil(all.length / size)); const safe = Math.min(Math.max(page, 0), pages - 1);
  const rows = all.slice(safe * size, safe * size + size).map((entry) => `${entry.action} — ${entry.reason}${entry.targetId ? ` (member ${entry.targetId})` : ""}`);
  const text = rows.length ? `Recent actions (page ${safe + 1}/${pages})\n\n${rows.join("\n")}` : "There are no moderation actions yet.";
  const controls = []; if (safe > 0) controls.push(inlineButton("Previous", `log:page:${safe - 1}`)); if (safe < pages - 1) controls.push(inlineButton("Next", `log:page:${safe + 1}`));
  controls.push(inlineButton("CSV snippet", "log:csv"));
  await ctx.reply(trimText(text), { reply_markup: inlineKeyboard([controls, [inlineButton("⬅️ Back", "moderation:open")]]) });
}

composer.command("log", async (ctx) => {
  await show(ctx);
});
composer.callbackQuery("log:view", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^log:page:\d+$/, async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx, Number(ctx.callbackQuery.data.split(":")[2])); });
composer.callbackQuery("log:csv", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx))) return; const csv = ["action,reason,target", ...state(ctx).actions.slice(-20).map((a) => `${a.action},${JSON.stringify(a.reason)},${a.targetId ?? ""}`)].join("\n"); await ctx.reply(trimText(csv)); });

export default composer;
