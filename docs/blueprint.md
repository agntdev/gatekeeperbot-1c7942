# Group Gatekeeper — Bot specification

**Archetype:** community

**Voice:** warm and encouraging — write every user-facing message, button label, error, and empty state in this voice.

A single-chat Telegram moderation bot that greets new members with a verification gate, mutes unverified joiners, detects obvious spam patterns (young accounts linking, repeated messages, floods), enforces configurable auto-actions (warn → mute → remove), provides admin commands and editable messaging, and keeps a rolling action log and short stats for owners.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram group admins for a single community chat
- Regular group members joining and interacting with the verification gate

## Success criteria

- New joiners are greeted and muted until they tap Verify; >95% of legitimate joiners successfully verify within default timeout
- Obvious spam patterns are automatically intercepted according to configured thresholds (link-from-new-account, repeated identical messages, flood) and auto-actions applied
- Admins can perform moderation actions and edit welcome/rules/thresholds in-chat with changes taking effect immediately
- Action log contains the last 500 moderation events and is queryable by admins
- Daily summary of removals and verification stats is posted to the group and optionally to an admin chat

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and show current welcome message and quick help
- **Verify** (button, actor: user, callback: verify:tap) — Confirm you're a real member to be unmuted
  - inputs: callback
  - outputs: member.verified=true, unmute action, action_log entry
- **View rules** (button, actor: user, callback: rules:view) — Show the group's rules (editable by admins)
  - outputs: message with rules
- **/moderation** (command, actor: admin, command: /moderation) — Open moderation admin menu (warn, mute, kick, ban, trust, settings)
  - inputs: admin check
  - outputs: interactive admin menu (buttons)
- **/log** (command, actor: admin, command: /log) — View recent action log entries (paginated)
  - inputs: optional: days, count
  - outputs: list of action_log entries (recent)

## Flows

### new_member_verification
_Trigger:_ member_join

1. Bot checks exemptions (admins, trusted users, pinned invite sources)
2. If not exempt: restrict member sending permissions (mute), create Verification challenge (timestamp, timeout = settings.welcome_timeout)
3. Send personalized welcome message with rules and Verify button; include appeal hint for admins
4. If member taps Verify before timeout: mark member.verified=true, lift mute, record Action log entry
5. If timeout expires without verification: remove member (kick) and post brief removal message explaining reason; record Action log entry; optionally notify ADMIN_CHAT_ID

_Data touched:_ Member, Verification challenge, Action log, Settings

### spam_detection_and_auto_action
_Trigger:_ message_receive

1. Ignore messages from exempt users and pinned messages
2. Evaluate spam heuristics: account_age < settings.link_account_age_threshold AND message contains link; identical message repeated N times in M window; message rate from same user > flood threshold
3. If heuristic matches: increment Infraction record for user, post brief explanation to group mentioning the action and how to appeal
4. Apply configured auto-action sequence (warn → temporary mute → kick/ban) based on infraction count and settings.auto_escalation_enabled
5. Record every enforcement as Action log entry

_Data touched:_ Infraction record, Member, Action log, Settings

### admin_moderation_flow
_Trigger:_ /moderation or inline admin button

1. Authenticate actor as admin
2. Show admin menu with actions: warn, mute (with duration), kick, ban, mark/unmark trusted, edit welcome/rules, set thresholds, view log
3. Admin selects action and target (via reply or user selection), optional reason input via ForceReply for free-form text
4. Bot executes action, updates Infraction and Action log, and optionally notifies ADMIN_CHAT_ID and posts brief confirmation in group

_Data touched:_ Member, Infraction record, Action log, Settings

### settings_edit_flow
_Trigger:_ /moderation -> Edit settings

1. Authenticate admin
2. Present editable settings via inline menu (welcome message, rules, welcome_timeout, thresholds, auto-escalation toggle, trusted list management)
3. For free-form edits (welcome message, rules) use ForceReply; for toggles or numeric thresholds use inline buttons and small input fields
4. Persist changes to Settings and confirm to admin; changes take effect immediately

_Data touched:_ Settings, Action log

### daily_summary_and_stats
_Trigger:_ scheduled (daily) or /summary command

1. Aggregate last 24h verification completions, removals, warnings, mutes, top offenders
2. Post compact summary to group and, if ADMIN_CHAT_ID set, forward summary to that chat
3. Persist summary generation event in Action log

_Data touched:_ Action log, Infraction record, Settings

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — optional: Telegram chat id where private admin notifications and daily summaries are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Member** _(retention: persistent)_ — Represent a Telegram user in the group and their state
  - fields: user_id, username, display_name, join_time, verified (bool), trusted (bool), is_admin (bool), mute_until (timestamp|null), infraction_count
- **Verification challenge** _(retention: session)_ — Temporary record created on join until verify or timeout
  - fields: challenge_id, user_id, issued_at, expires_at, status (pending|verified|expired)
- **Infraction record** _(retention: persistent)_ — Counts and timestamps of rule violations used for escalation
  - fields: user_id, infractions: [{type, timestamp, message_snapshot}], current_count
- **Action log** _(retention: persistent (rolling buffer last 500 actions))_ — Rolling audit of moderation actions and decisions
  - fields: entry_id, actor_id (bot/admin/system), target_id, action (warn|mute|kick|ban|verify|remove|setting_change), reason, metadata, timestamp
- **Settings** _(retention: persistent)_ — Admin-editable configuration for behavior and messages
  - fields: welcome_message, rules_text, welcome_timeout_seconds, link_account_age_days_threshold, identical_repeat_threshold (count, window_seconds), flood_threshold (count, window_seconds), auto_escalation_enabled (bool), trusted_user_ids, action_sequence (mapping infractions -> action)

## Integrations

- **Telegram** (required) — Bot API messaging, callbacks, admin actions, restriction/unban APIs
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Edit welcome message and rules text
- Set welcome timeout (default 180s)
- Configure spam thresholds: link account age, identical repeat, flood window/count
- Enable/disable automatic escalation and adjust the auto-action sequence (warn, mute durations, kick/ban)
- Add/remove users from Trusted list (admins auto-trusted)
- View and paginate last 500 action log entries and export a CSV snippet for a time window
- Set ADMIN_CHAT_ID to receive private critical notifications and daily summaries
- Manually run summary generation and force-unmute or restore a member

## Notifications

- Immediate group post for any automated removal explaining reason and appeal path
- Optional private notification to ADMIN_CHAT_ID for critical removals and threshold events
- Daily summary posted to group and optionally to ADMIN_CHAT_ID
- Admin confirmations in-chat for manual moderation commands

## Permissions & privacy

- Bot must be made a chat administrator with rights to restrict members, delete messages, and ban users
- The bot stores user IDs, timestamps, infraction metadata, and editable texts; action log retained up to 500 entries
- Only admins can view full action logs and change settings; summary stats shown to group are aggregated and non-sensitive
- Data is stored for the lifetime of the bot instance; no external third-party APIs are used

## Edge cases

- Bot lacks admin rights: must detect and show an actionable error to admins explaining missing permissions
- User cannot press Verify (e.g., blocked bot messages or keyboard disabled): bot should allow admins to manually verify/unmute
- Multiple rapid joins causing race conditions: enforce per-user challenge and throttle welcome messages to avoid flooding
- Invited by admin: treat as exempt (admins are auto-trusted) unless explicitly untrusted
- Joined entity is a channel or deleted account: skip verification and do not attempt to mute/bannable actions
- Network or Telegram API errors during enforcement: retry with backoff and log failures to Action log; notify admins if repeated failures
- Owner removes bot or bot is banned: stop scheduled tasks, preserve persistent storage where possible

## Required tests

- Dialog-level: join → bot mutes → user taps Verify → bot unmute and verifies (end-to-end)
- Dialog-level: join → no Verify → timeout → bot removes member and records action
- Spam patterns: link from young account triggers warn/mute/kick per configured thresholds
- Spam patterns: repeated identical message N times within window increments infraction and escalates
- Spam patterns: rapid-message flood detection triggers expected action
- Admin commands: warn/mute/kick/ban operate correctly and create Action log entries
- Settings persistence: edits to welcome/rules/thresholds take effect immediately and persist across restarts
- Trusted exemptions: trusted users and admins bypass automated actions
- Action log retention: confirm rolling buffer keeps most recent 500 entries and pagination works
- Permission failure: if bot lacks admin rights, admin-guidance message appears

## Assumptions

- Bot is installed into a single Telegram group (one chat per bot instance)
- Admins will grant the bot chat administrator rights required for restriction and ban operations
- Default welcome timeout is 180 seconds (3 minutes) unless owner changes it
- Default thresholds: link account age threshold = 7 days; identical repeat = 3 times in 60s; flood = >5 messages in 10s
- Default auto-action sequence: warn → 10-minute mute → kick on repeat; admins can change or disable escalation
- Admins are auto-trusted; trusted list is managed by admins
