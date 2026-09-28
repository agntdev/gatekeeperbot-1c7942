import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { record, state } from "../moderation-state.js";

const composer = new Composer<Ctx>();
const settingsMenu = inlineKeyboard([
  [inlineButton("Edit welcome", "settings:welcome"), inlineButton("Edit rules", "settings:rules")],
  [inlineButton("Welcome timeout", "settings:timeout"), inlineButton("Spam thresholds", "settings:thresholds")],
  [inlineButton("Toggle escalation", "settings:toggle"), inlineButton("Trusted list", "settings:trusted")],
  [inlineButton("⬅️ Back", "moderation:open")],
]);

async function open(ctx: Ctx): Promise<void> { if (!(await requireOwner(ctx))) return; await ctx.reply("Choose what you’d like to change.", { reply_markup: settingsMenu }); }
composer.callbackQuery("settings:open", async (ctx) => { await ctx.answerCallbackQuery(); await open(ctx); });
composer.callbackQuery(/^settings:(welcome|rules|timeout|thresholds|trusted)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx))) return;
  const kind = ctx.callbackQuery.data.split(":")[1]; ctx.session.flow = `settings:${kind}`;
  const prompt = kind === "welcome" ? "Reply with the welcome message." : kind === "rules" ? "Reply with the group rules." : kind === "timeout" ? "Reply with the timeout in seconds (for example, 180)." : kind === "thresholds" ? "Reply with three numbers: link-age-days, repeat-count, flood-count." : "Reply with a member ID to add or remove from Trusted.";
  await ctx.reply(prompt, { reply_markup: { force_reply: true, input_field_placeholder: "Type your change…" } });
});
composer.callbackQuery("settings:toggle", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx))) return; const s = state(ctx); s.settings.autoEscalationEnabled = !s.settings.autoEscalationEnabled; record(ctx, "setting_change", "Automatic escalation changed"); await ctx.reply(`Automatic escalation is now ${s.settings.autoEscalationEnabled ? "on" : "off"}.`, { reply_markup: settingsMenu }); });
composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow; if (!flow?.startsWith("settings:")) return next(); if (!(await requireOwner(ctx))) return;
  const kind = flow.split(":")[1]; const value = ctx.message.text.trim(); const s = state(ctx);
  if (kind === "welcome") s.settings.welcomeMessage = value.slice(0, 1000);
  else if (kind === "rules") s.settings.rulesText = value.slice(0, 2000);
  else if (kind === "timeout") { const n = Number(value); if (!Number.isInteger(n) || n < 30 || n > 86_400) { await ctx.reply("Use a whole number from 30 to 86400 seconds."); return; } s.settings.welcomeTimeoutSeconds = n; }
  else if (kind === "thresholds") { const nums = value.split(/\s+/).map(Number); if (nums.length !== 3 || nums.some((n) => !Number.isInteger(n) || n < 1)) { await ctx.reply("Send three positive whole numbers: link-age-days, repeat-count, flood-count."); return; } [s.settings.linkAccountAgeDaysThreshold, s.settings.identicalRepeatThreshold, s.settings.floodThreshold] = nums; }
  else { const id = Number(value); if (!Number.isInteger(id) || id < 1) { await ctx.reply("That doesn’t look like a member ID."); return; } const at = s.settings.trustedUserIds.indexOf(id); if (at >= 0) s.settings.trustedUserIds.splice(at, 1); else s.settings.trustedUserIds.push(id); }
  ctx.session.flow = undefined; record(ctx, "setting_change", `Changed ${kind}`); await ctx.reply("Saved — the new setting is active now.", { reply_markup: settingsMenu });
});
export default composer;
