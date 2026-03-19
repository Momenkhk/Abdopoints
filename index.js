const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ActivityType,
} = require('discord.js');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('config.json is missing. Please create it before running the bot.');
    process.exit(1);
  }

  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  parsed.prefix = parsed.prefix || '$';
  parsed.reviewUrl =
    parsed.reviewUrl || 'https://discord.com/channels/1289528496040841226/1477365596482961478';
  parsed.dmImageUrl =
    parsed.dmImageUrl ||
    'https://cdn.discordapp.com/attachments/1466468379857522840/1476349354284552444/New_Project.png?ex=69a0ccfb&is=699f7b7b&hm=10dbd30eae549e613d9f7a8e1f76142a83628ff08691e7c6aa58526190dba881&';

  parsed.presence = parsed.presence || {};
  parsed.presence.status = parsed.presence.status || 'idle';
  parsed.presence.type = (parsed.presence.type || 'WATCHING').toUpperCase();
  parsed.presence.name = parsed.presence.name || 'Abdo Càfe';

  parsed.topRefreshHours = Number(parsed.topRefreshHours || 3);
  if (!Number.isFinite(parsed.topRefreshHours) || parsed.topRefreshHours <= 0) {
    parsed.topRefreshHours = 3;
  }
  parsed.topChannelId = parsed.topChannelId || '';

  return parsed;
}

const config = loadConfig();
const TOP_REFRESH_MS = config.topRefreshHours * 60 * 60 * 1000;

const TOKEN = process.env.DISCORD_TOKEN || config.token;
if (!TOKEN || TOKEN === 'PUT_YOUR_BOT_TOKEN_HERE') {
  console.error('Bot token is missing. Put it in config.json (token) or DISCORD_TOKEN env var.');
  process.exit(1);
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initial = { points: {}, roleThresholds: {}, topLive: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  parsed.points = parsed.points || {};
  parsed.roleThresholds = parsed.roleThresholds || {};
  parsed.topLive = parsed.topLive || {};

  return parsed;
}

function saveDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function hasAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function extractUserId(text) {
  if (!text) return null;
  const mention = text.match(/^<@!?(\d+)>$/);
  if (mention) return mention[1];
  const direct = text.match(/^(\d{16,20})$/);
  if (direct) return direct[1];
  return null;
}

function extractRoleId(text) {
  if (!text) return null;
  const mention = text.match(/^<@&(\d+)>$/);
  if (mention) return mention[1];
  const direct = text.match(/^(\d{16,20})$/);
  if (direct) return direct[1];
  return null;
}

async function resolveMember(guild, arg) {
  const userId = extractUserId(arg);
  if (!userId) return null;

  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

function parseRotbaArgs(content) {
  const parts = content.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const points = Number(parts[parts.length - 1]);
  if (!Number.isInteger(points) || points <= 0) return null;

  const roleRaw = parts.slice(1, -1).join(' ');
  return { roleRaw, points };
}

async function resolveRole(guild, roleRaw) {
  const roleId = extractRoleId(roleRaw);
  if (roleId) {
    return guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  }

  const lower = roleRaw.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) || null;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function parseAmountInput(input) {
  if (!input) return null;

  const normalized = input.trim().toLowerCase().replace(/,/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const multipliers = {
    k: 1_000,
    m: 1_000_000,
    b: 1_000_000_000,
    t: 1_000_000_000_000,
    q: 1_000_000_000_000_000,
    qa: 1_000_000_000_000_000,
  };

  const suffix = match[2];
  if (suffix && !multipliers[suffix]) return null;

  const amount = Math.floor(value * (multipliers[suffix] || 1));
  return amount > 0 ? amount : null;
}

function calculateTaxBreakdown(amount) {
  const tax = Math.ceil(amount * 0.05);
  const net = amount - tax;
  const transferAmount = Math.ceil(amount / 0.95);

  return { tax, net, transferAmount };
}

function getActivityType(type) {
  switch (type) {
    case 'PLAYING':
      return ActivityType.Playing;
    case 'LISTENING':
      return ActivityType.Listening;
    case 'COMPETING':
      return ActivityType.Competing;
    case 'STREAMING':
      return ActivityType.Streaming;
    default:
      return ActivityType.Watching;
  }
}

function formatTopText(db) {
  const top = Object.entries(db.points)
    .map(([userId, points]) => ({ userId, points: Number(points) }))
    .filter((item) => Number.isFinite(item.points) && item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  if (top.length === 0) {
    return '🏆 **Top 10 Points**\n\nلا يوجد نقاط حالياً.';
  }

  const lines = top.map((item, index) => `**${index + 1}.** <@${item.userId}> — **${item.points}** نقطة`);
  return ['🏆 **Top 10 Points (Live)**', '', ...lines].join('\n');
}

async function refreshTopLiveMessage(guild, forceChannelId = null) {
  const db = loadDb();
  db.topLive = db.topLive || {};

  const channelId = forceChannelId || db.topLive.channelId || config.topChannelId;
  if (!channelId) return;

  let channel;
  try {
    channel = await guild.channels.fetch(channelId);
  } catch {
    return;
  }

  if (!channel || !channel.isTextBased()) return;

  const content = `${formatTopText(db)}\n\nآخر تحديث: <t:${Math.floor(Date.now() / 1000)}:R>`;

  let leaderboardMessage = null;
  if (db.topLive.messageId) {
    leaderboardMessage = await channel.messages.fetch(db.topLive.messageId).catch(() => null);
  }

  if (leaderboardMessage) {
    await leaderboardMessage.edit({ content });
  } else {
    leaderboardMessage = await channel.send({ content });
  }

  db.topLive.channelId = channel.id;
  db.topLive.messageId = leaderboardMessage.id;
  db.topLive.lastUpdatedAt = new Date().toISOString();
  saveDb(db);
}

function startTopLiveLoop() {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await refreshTopLiveMessage(guild);
      } catch (error) {
        console.error(`Top live refresh failed for guild ${guild.id}:`, error.message);
      }
    }
  }, TOP_REFRESH_MS);
}

async function sendDmWithImage(member, text) {
  await member.send(text);
  await member.send(config.dmImageUrl);
}

async function notifyNewPoint(member, totalPoints) {
  const message = [
    '> <:ar7ab:1479312018782683188>  لقد حصلت على نقطة جديدة 1',
    '',
    `> ** <a:Flower:1477375556789211212>  إجمالي عدد نقاطك ${totalPoints}**`,
    `لا تنسَ تقييمنا هنا ${config.reviewUrl}`,
  ].join('\n');

  await sendDmWithImage(member, message);
}

async function notifyRoleGranted(member, roleName) {
  const message = [
    '**شكرا لاختيارك Abdo Càfe**',
    '',
    '> **نتمنى لك ان تكون الخدمة قد  اعجبتك.**',
    `> **لا تنسا أن تضع  رأيك هنا: ${config.reviewUrl}  **`,
    '',
    `**تم منحك رتبه : ${roleName}**`,
  ].join('\n');

  await sendDmWithImage(member, message);
}

async function grantEligibleRoles(member, db) {
  const userPoints = db.points[member.id] || 0;

  const thresholds = Object.entries(db.roleThresholds)
    .map(([roleId, required]) => ({ roleId, required: Number(required) }))
    .filter((item) => Number.isInteger(item.required) && item.required > 0)
    .sort((a, b) => a.required - b.required);

  for (const entry of thresholds) {
    if (userPoints < entry.required) continue;

    const role = member.guild.roles.cache.get(entry.roleId);
    if (!role) continue;
    if (member.roles.cache.has(role.id)) continue;

    try {
      await member.roles.add(role, 'Reached configured points threshold');
      await notifyRoleGranted(member, role.name);
    } catch (error) {
      console.error(`Failed to grant role ${role.id} to ${member.id}:`, error.message);
    }
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.on('ready', async () => {
  client.user.setPresence({
    status: config.presence.status,
    activities: [
      {
        name: config.presence.name,
        type: getActivityType(config.presence.type),
      },
    ],
  });

  startTopLiveLoop();

  for (const guild of client.guilds.cache.values()) {
    try {
      await refreshTopLiveMessage(guild);
    } catch (error) {
      console.error(`Initial top live setup failed for guild ${guild.id}:`, error.message);
    }
  }

  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const [command] = message.content.trim().split(/\s+/);
  const base = command.toLowerCase();

  if (base === `${config.prefix}top`) {
    const db = loadDb();
    await message.reply(formatTopText(db));

    try {
      await refreshTopLiveMessage(message.guild, message.channel.id);
    } catch {
      // ignore live refresh failures for command flow
    }

    return;
  }

  if (base === `${config.prefix}tax`) {
    const amountArg = message.content.trim().split(/\s+/)[1];
    const normalizedAmount = parseAmountInput(amountArg);

    if (!normalizedAmount) {
      await message.reply(`الاستخدام الصحيح: \`${config.prefix}tax <amount>\` مثل: \`${config.prefix}tax 1000\` أو \`${config.prefix}tax 1k\` أو \`${config.prefix}tax 1.5m\`.`);
      return;
    }

    const { tax, net, transferAmount } = calculateTaxBreakdown(normalizedAmount);

    await message.reply([
      `🪙 **ضريبة مبلغ ${formatNumber(normalizedAmount)}**`,
      '',
      `• 💳 كم بيسحب منك البوت: **${formatNumber(tax)}**`,
      `• 💵 كم بيتوصل إلى شخص: **${formatNumber(net)}**`,
      `• 💰 كم لازم تحول عشان يوصل المبلغ بالضبط: **${formatNumber(transferAmount)}**`,
    ].join('\n'));
    return;
  }

  if (base === `${config.prefix}points`) {
    const arg = message.content.trim().split(/\s+/)[1];
    let target = message.member;

    if (arg) {
      target = await resolveMember(message.guild, arg);
      if (!target) {
        await message.reply(`الاستخدام الصحيح: \`${config.prefix}points [user]\` (منشن أو آيدي).`);
        return;
      }
    }

    const db = loadDb();
    const totalPoints = db.points[target.id] || 0;
    await message.reply(`عدد نقاط ${target}: **${totalPoints}**`);
    return;
  }

  if (base === `${config.prefix}tam`) {
    if (!hasAdmin(message.member)) {
      await message.reply('هذا الأمر متاح فقط لمن لديه صلاحية Administrator.');
      return;
    }

    const arg = message.content.trim().split(/\s+/)[1];
    const target = await resolveMember(message.guild, arg);
    if (!target) {
      await message.reply(`الاستخدام الصحيح: \`${config.prefix}tam <user>\` (منشن أو آيدي).`);
      return;
    }

    const db = loadDb();
    db.points[target.id] = (db.points[target.id] || 0) + 1;
    saveDb(db);

    await message.reply(`تمت إضافة نقطة واحدة لـ ${target}. إجمالي نقاطه: ${db.points[target.id]}`);

    try {
      await notifyNewPoint(target, db.points[target.id]);
    } catch {
      await message.channel.send(`تعذر إرسال رسالة خاصة إلى ${target}.`);
    }

    await grantEligibleRoles(target, db);
    await refreshTopLiveMessage(message.guild);
    return;
  }

  if (base === `${config.prefix}rotba`) {
    if (!hasAdmin(message.member)) {
      await message.reply('هذا الأمر متاح فقط لمن لديه صلاحية Administrator.');
      return;
    }

    const parsed = parseRotbaArgs(message.content);
    if (!parsed) {
      await message.reply(`الاستخدام الصحيح: \`${config.prefix}rotba <role> <عدد النقاط>\``);
      return;
    }

    const role = await resolveRole(message.guild, parsed.roleRaw);
    if (!role) {
      await message.reply('لم أتمكن من العثور على الرتبة المطلوبة. استخدم منشن الرتبة أو آيدي أو الاسم الكامل.');
      return;
    }

    const db = loadDb();
    db.roleThresholds[role.id] = parsed.points;
    saveDb(db);

    await message.reply(`تم ضبط الرتبة **${role.name}** عند **${parsed.points}** نقطة.`);
  }
});

client.login(TOKEN);
