import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { now, record, remove, state, mute, unmute, type ModerationAction } from "../moderation-state.js";

registerMainMenuItem({ label: "🛡 Moderation", data: "moderation:open", order: 80 });
const composer = new Composer<Ctx>();

const menu = inlineKeyboard([
  [inlineButton("Warn a member", "moderation:warn"), inlineButton("Mute a member", "moderation:mute")],
  [inlineButton("Kick a member", "moderation:kick"), inlineButton("Ban a member", "moderation:ban")],
  [inlineButton("Trust list", "moderation:trust"), inlineButton("Edit settings", "settings:open")],
  [inlineButton("View action log", "log:view")],
]);

async function open(ctx: Ctx): Promise<void> {
  if (!(await requireOwner(ctx))) return;
  await ctx.reply("Here’s the moderation desk. Choose an action below.", { reply_markup: menu });
}

composer.command("moderation", async (ctx) => {
  await open(ctx);
});

composer.callbackQuery("moderation:open", async (ctx) => { await ctx.answerCallbackQuery(); await open(ctx); });
composer.callbackQuery(/^moderation:(warn|mute|kick|ban|trust)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx))) return;
  const action = ctx.callbackQuery.data.split(":")[1];
  if (action === "trust") { await ctx.reply("Send the member’s numeric Telegram ID to add or remove them from Trusted.", { reply_markup: { force_reply: true, input_field_placeholder: "Member ID" } }); return; }
  ctx.session.flow = `moderation:${action}`;
  await ctx.reply(`Send the member’s numeric Telegram ID to ${action === "mute" ? "mute" : action === "ban" ? "ban" : action === "kick" ? "kick" : "warn"} them.`, { reply_markup: { force_reply: true, input_field_placeholder: "Member ID" } });
});
composer.callbackQuery("moderation:restore", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx))) return; const id = Number(ctx.callbackQuery.data.split(":")[2]); if (!Number.isInteger(id)) { await ctx.reply("That member could not be found."); return; } await unmute(ctx, id); state(ctx).members[String(id)] && (state(ctx).members[String(id)].verified = true); record(ctx, "verify", "Admin restored member", id); await ctx.reply("The member can speak again."); });
composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow; if (!flow?.startsWith("moderation:")) return next(); if (!(await requireOwner(ctx))) return;
  const id = Number(ctx.message.text.trim()); const action = flow.split(":")[1];
  if (!Number.isInteger(id) || id < 1) { await ctx.reply("Send a whole-number Telegram ID, or tap /start to leave this flow."); return; }
  let ok = true; if (action === "mute") ok = await mute(ctx, id, now() + 600_000); else if (action === "kick") ok = await remove(ctx, id, false); else if (action === "ban") ok = await remove(ctx, id, true);
  if (action === "warn") { const s = state(ctx); const list = s.infractions[String(id)] ?? []; list.push({ type: "manual warning", at: now(), snapshot: "Admin warning" }); s.infractions[String(id)] = list; }
  ctx.session.flow = undefined; record(ctx, (action === "kick" ? "remove" : action) as ModerationAction, "Admin action", id); await ctx.reply(ok ? "Done — the action is recorded." : "Telegram couldn’t apply that action. Check that I’m an admin with the right permissions.", { reply_markup: menu });
});

export default composer;
