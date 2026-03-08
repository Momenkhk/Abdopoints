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

  return parsed;
}

const config = loadConfig();
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
    const initial = { points: {}, roleThresholds: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  parsed.points = parsed.points || {};
  parsed.roleThresholds = parsed.roleThresholds || {};

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

client.on('ready', () => {
  client.user.setPresence({
    status: config.presence.status,
    activities: [
      {
        name: config.presence.name,
        type: getActivityType(config.presence.type),
      },
    ],
  });

  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const [command] = message.content.trim().split(/\s+/);
  const base = command.toLowerCase();


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
