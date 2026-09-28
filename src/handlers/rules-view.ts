import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { state } from "../moderation-state.js";

registerMainMenuItem({ label: "📜 View rules", data: "rules:view", order: 20 });
const composer = new Composer<Ctx>();

composer.callbackQuery("rules:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(state(ctx).settings.rulesText, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) });
});

export default composer;
