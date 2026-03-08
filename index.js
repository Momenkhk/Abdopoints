const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ActivityType,
} = require('discord.js');

const MESSAGE_FLAGS_IS_COMPONENTS_V2 = 32768;

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('DISCORD_TOKEN is missing. Set it in your environment before running the bot.');
  process.exit(1);
}

const PREFIX = '$';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

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

async function notifyNewPoint(member, totalPoints) {
  await member.send({
    flags: MESSAGE_FLAGS_IS_COMPONENTS_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: '> <:ar7ab:1479312018782683188>  لقد حصلت على نقطة جديدة 1',
          },
          {
            type: 10,
            content: `> ** <a:Flower:1477375556789211212>  إجمالي عدد نقاطك ${totalPoints}**`,
          },
          {
            type: 10,
            content: 'لا تنسَ تقييمنا هنا https://discord.com/channels/1289528496040841226/1477365596482961478',
          },
        ],
      },
    ],
  });
}

async function notifyRoleGranted(member, roleName) {
  await member.send({
    flags: MESSAGE_FLAGS_IS_COMPONENTS_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: '**شكرا لاختيارك Abdo Càfe**',
          },
          {
            type: 10,
            content: '> **نتمنى لك ان تكون الخدمة قد  اعجبتك.**',
          },
          {
            type: 10,
            content: '> **لا تنسا أن تضع  رأيك هنا: https://discord.com/channels/1289528496040841226/1477365596482961478  **',
          },
          {
            type: 10,
            content: `**تم منحك رتبه : ${roleName}**`,
          },
        ],
      },
    ],
  });
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
    status: 'idle',
    activities: [
      {
        name: 'Abdo Càfe',
        type: ActivityType.Watching,
      },
    ],
  });

  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [command] = message.content.trim().split(/\s+/);
  const base = command.toLowerCase();

  if (base === '$tam') {
    if (!hasAdmin(message.member)) {
      await message.reply('هذا الأمر متاح فقط لمن لديه صلاحية Administrator.');
      return;
    }

    const arg = message.content.trim().split(/\s+/)[1];
    const target = await resolveMember(message.guild, arg);
    if (!target) {
      await message.reply('الاستخدام الصحيح: `$tam <user>` (منشن أو آيدي).');
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

  if (base === '$rotba') {
    if (!hasAdmin(message.member)) {
      await message.reply('هذا الأمر متاح فقط لمن لديه صلاحية Administrator.');
      return;
    }

    const parsed = parseRotbaArgs(message.content);
    if (!parsed) {
      await message.reply('الاستخدام الصحيح: `$rotba <role> <عدد النقاط>`');
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
