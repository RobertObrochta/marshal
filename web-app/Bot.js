import path from "node:path";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";

// Keeps data/entry-list.json in sync with the Discord server:
//   - the bot starts           -> everyone already in the server is imported
//   - someone joins            -> added to the entry list
//   - someone gets a tracked   -> that role's name is added to their
//     role (ACC Americas, LMU)    "championships" list
// Which roles count is set in data/tracked-roles.json, e.g. ["ACC Americas", "LMU"]
// (role names or role IDs).

export function createEntryList({ dataDir }) {
  const entryFile = path.join(dataDir, "data/entry-list.json");
  const rolesFile = path.join(dataDir, "data/tracked-roles.json");

  // One writer at a time, so two events can't overwrite each other
  let queue = Promise.resolve();
  const enqueue = (fn) => {
    const job = queue.then(fn);
    queue = job.catch(() => {});
    return job;
  };

  async function readJson(file, fallback) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return fallback;
      throw err;
    }
  }

  async function writeAtomic(file, data) {
    await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2) + "\n");
    await rename(`${file}.tmp`, file);
  }

  // Read on every event, so edits to tracked-roles.json apply without a restart
  async function trackedKeys() {
    const list = await readJson(rolesFile, []);
    return Array.isArray(list)
      ? list.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
      : [];
  }

  function trackedRolesOf(member, keys) {
    return [...member.roles.cache.values()]
      .filter((r) => keys.includes(String(r.id)) || keys.includes(r.name.toLowerCase()))
      .map((r) => r.name);
  }

  // Adds the member if they aren't listed, refreshes their names, and adds any
  // tracked roles they hold to their championships list. Never removes anything.
  // Works on `list` in place and says whether anything changed.
  function applyMember(list, member, keys) {
    let changed = false;
    let entry = list.find((e) => e.discordId === member.id);

    if (!entry) {
      entry = {
        discordId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        joinedAt: member.joinedAt ? member.joinedAt.toISOString() : new Date().toISOString(),
        championships: [],
      };
      list.push(entry);
      changed = true;
    } else {
      if (entry.username !== member.user.username) {
        entry.username = member.user.username;
        changed = true;
      }
      if (entry.displayName !== member.displayName) {
        entry.displayName = member.displayName;
        changed = true;
      }
    }

    if (!Array.isArray(entry.championships)) {
      entry.championships = [];
      changed = true;
    }
    for (const role of trackedRolesOf(member, keys)) {
      if (!entry.championships.includes(role)) {
        entry.championships.push(role);
        changed = true;
      }
    }
    return { entry, changed };
  }

  function upsertMember(member) {
    if (member.user.bot) return Promise.resolve(null);
    return enqueue(async () => {
      const keys = await trackedKeys();
      const list = await readJson(entryFile, []);
      const { entry, changed } = applyMember(list, member, keys);
      if (changed) await writeAtomic(entryFile, list);
      return entry;
    });
  }

  // One read and one write for a whole batch (used for the import at startup)
  function upsertMembers(members) {
    return enqueue(async () => {
      const keys = await trackedKeys();
      const list = await readJson(entryFile, []);
      const before = list.length;
      let changedAny = false;
      for (const member of members) {
        if (member.user.bot) continue;
        if (applyMember(list, member, keys).changed) changedAny = true;
      }
      if (changedAny) await writeAtomic(entryFile, list);
      return { added: list.length - before, total: list.length };
    });
  }

  async function ensureFile() {
    await mkdir(path.dirname(entryFile), { recursive: true });
    const list = await readJson(entryFile, null);
    if (list === null) await writeAtomic(entryFile, []);
  }

  return { upsertMember, upsertMembers, ensureFile, entryFile, rolesFile };
}

// Connects to Discord. Does nothing unless DISCORD_BOT_TOKEN and DISCORD_GUILD_ID
// are set, so only the machine that should run the bot (the BeagleBone) needs them.
export async function startBot({ dataDir }) {
  const { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } = process.env;
  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    console.log("Discord bot is off (set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID to turn it on)");
    return;
  }

  let discord;
  try {
    discord = await import("discord.js");
  } catch {
    console.error("Discord bot is off: run `npm install discord.js`");
    return;
  }
  const { Client, Events, GatewayIntentBits } = discord;

  const entries = createEntryList({ dataDir });
  await entries.ensureFile();

  const client = new Client({
    // GuildMembers is a privileged intent: enable "Server Members Intent"
    // for the bot in the Discord Developer Portal.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  const handle = (member) => {
    if (member.guild.id !== DISCORD_GUILD_ID) return;
    entries.upsertMember(member).catch((err) =>
      console.error("Entry list update failed:", err.message)
    );
  };

  client.on(Events.GuildMemberAdd, handle);
  client.on(Events.GuildMemberUpdate, (_before, after) => handle(after));

  client.once(Events.ClientReady, async (c) => {
    console.log(`Discord bot logged in as ${c.user.tag}`);
    try {
      const guild = await c.guilds.fetch(DISCORD_GUILD_ID);
      const roles = await guild.roles.fetch();
      console.log(`Roles in "${guild.name}" (put names or IDs in data/tracked-roles.json):`);
      for (const r of roles.values()) {
        if (r.name !== "@everyone") console.log(`  ${r.name}  (${r.id})`);
      }
    } catch (err) {
      console.error("Bot can't see that server. Is it invited, and is DISCORD_GUILD_ID right?", err.message);
      return;
    }

    // People who joined before the bot existed would otherwise never appear
    try {
      const guild = await c.guilds.fetch(DISCORD_GUILD_ID);
      const members = await guild.members.fetch();
      const { added, total } = await entries.upsertMembers(members.values());
      console.log(`Entry list synced: ${added} added, ${total} total`);
    } catch (err) {
      console.error("Couldn't import existing members:", err.message);
    }
  });

  client.login(DISCORD_BOT_TOKEN).catch((err) => {
    console.error(`Discord bot login failed: ${err.message}`);
    if (/disallowed intents/i.test(err.message)) {
      console.error('Turn on "Server Members Intent" for the bot in the Discord Developer Portal.');
    }
  });
}