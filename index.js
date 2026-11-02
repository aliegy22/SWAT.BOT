const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const VB_COLORS = {
  ticket: 0x5865F2,
  success: 0x57F287,
  error: 0xED4245
};

// محاكي التخزين الدائم المدمج ليعمل محلياً على الاستضافة الخارجية
const localDB = new Map();
const botData = {
  get: async (key, type, guildId) => localDB.get(`${guildId}:${type}:${key}`) || null,
  set: async (key, type, data, guildId) => { localDB.set(`${guildId}:${type}:${key}`, data); return data; },
  update: async (key, type, updater, guildId) => {
    const fullKey = `${guildId}:${type}:${key}`;
    const cur = localDB.get(fullKey);
    const updated = updater(cur);
    localDB.set(fullKey, updated);
    return updated;
  },
  getAll: async (type, guildId, limit) => {
    const results = [];
    for (const [k, v] of localDB.entries()) {
      if (k.startsWith(`${guildId}:${type}:`)) {
        results.push({ discordUserId: k.split(':')[2], data: v });
      }
    }
    return results;
  }
};

global.botData = botData;
global.safeInterval = (fn, ms) => setInterval(fn, ms);
global.safeTimeout = (fn, ms) => setTimeout(fn, ms);
global.__setupCommands = [];

function sanitizeChannelName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 100);
}

// ==========================================
// 1. نظام التيكتس (كامل بكل نصوصك ورسائلك)
// ==========================================
const TICKET_CONFIG = {
  "enabled": true,
  "supportRoles": ["1566134003352862861"],
  "categories": [
    {
      "id": "support",
      "name": "تقديم شكوي",
      "emoji": "🎫",
      "staffRoles": ["1566134003352862861"],
      "description": "SWAT"
    }
  ],
  "settings": {
    "allowClaiming": true,
    "autoClose": true,
    "autoCloseHours": 48,
    "sendTranscript": true,
    "pingStaff": true,
    "ticketLimit": 1,
    "namingScheme": "number"
  },
  "messages": {
    "panelTitle": "شكاوي الفريق",
    "panelDescription": "بعض الملاحظات التي يجب الانتباة منها تجنباً لرفض الشكوي الخاصة بك :\n\n1-لن يتم قبول الشكاوي المقدمة من طرف ثالث.\n2-قد لا يتم قبول الأدلة المقدمة إذا تم تسجيلها قبل أكثر من أسبوع.\n3-يمكن تقديم استئناف ضد العقوبات الصادرة من الإداريين خلال ثلاثة أيام.\n4-يُمنع إنشاء أكثر من شكوي واحد لنفس الحاله.\n5-يجب أن يكون التاريخ والوقت ظاهرين بوضوح في الدليل ليتم قبوله، وإلا فقد يتم رفض الشكوي.\n6-الشكاوي ليست مجهولة أو سريه. قد يتم مشاركة دليلك مع لاعبين آخرين عند الطلب لتنفيذ العقوبة.\n7-يُمنع الإشارة غير الضرورية أو إساءة استخدام الإشارات.\n8-مراجعة الشكاوي ضد اللاعبين وقادة الفصائل، دون الحاجة إلى فحص سجل النظام أو خدمات مشابهة، قد تستغرق ما يصل إلى 24 ساعة. أما مراجعة التقارير ضد الإداريين فتستغرق ما يصل إلى 72 ساعة، باستثناء الحالات التي تتضمن انتهاكات جسيمة .\n9-داخل الشكوي وبعد حل المشكلة وقام الاداري ببداء اغلاق الشكوي يظهر لك زر (لدي مشكلة) يمكنك من خلال النقر علية اكمال الشكوي\nملاحظة : انتبة من تكرار اعادة فتح الشكوي لانة للاداري كامل الصلاحيات في كتمك 60 دقيقة اذا لوحظ انك تقوم بتخريب الشكوي فقط وعلي ذالك اذا تكرر الامر يعرضك للطرد المباشر من المجتمع.\n10-اذا تعرضت للظلم او واجهتك مشكلة مثال علي ذالك لم يقم الاداري بحل المشكلة او قام باغلاق الشكوي دون الرد يمكنك تقديم شكوي ضد إداري\n\nلتقديم شكوي اضغط زر التقديم",
    "welcomeMessage": "مرحباً بك : {user} شكراً لك علي تعاونك معنا فى حل المشاكل داخل الفريق , نحن هنا لمساعدتك {category} .",
    "closeMessage": "هذة الشكوي تم حلها سيتم اغلاقها خلال 5 ثواني , شكراً لك "
  },
  "panelChannel": "1564602855665434634",
  "categoryParent": "1564615949129351260",
  "transcriptChannel": "1566228849098756307"
};

function _effectiveRoles(category) {
  const _global = ["1566134003352862861"];
  const _cat = (category && Array.isArray(category.staffRoles)) ? category.staffRoles.filter(Boolean) : [];
  if (category && category.private && _cat.length > 0) return [...new Set(_cat)];
  return [...new Set([..._global, ..._cat])];
}

async function getTicket(channelId, guildId) {
  const ticket = await botData.get(channelId, 'ticket', guildId);
  return ticket && ticket.released ? null : ticket;
}
async function setTicket(channelId, ticketData, guildId) {
  await botData.set(channelId, 'ticket', ticketData, guildId);
}
async function deleteTicket(channelId, guildId) {
  await botData.set(channelId, 'ticket', null, guildId);
}
async function incrementTicketCounter(guildId) {
  const result = await botData.update(guildId, 'ticket_counter', (cur) => {
    const n = (typeof cur === 'number' ? cur : (cur?.count ?? 0)) + 1;
    return { count: n };
  }, guildId);
  return result?.count ?? 1;
}
async function claimUserTicketSlot(userId, guildId, limit) {
  let took = false;
  const res = await botData.update(userId, 'ticket_count', (cur) => {
    took = false;
    const n = typeof cur === 'number' ? cur : (cur?.count ?? 0);
    if (n >= limit) return null;
    took = true;
    return { count: n + 1 };
  }, guildId);
  return !!res && took;
}
async function decrementUserTicketCount(userId, guildId) {
  await botData.update(userId, 'ticket_count', (cur) => ({
    count: Math.max(0, (typeof cur === 'number' ? cur : (cur?.count ?? 0)) - 1),
  }), guildId);
}
async function releaseTicketSlot(channelId, guildId, live) {
  let owner = null;
  const claimed = await botData.update(channelId, 'ticket', (cur) => {
    owner = null;
    if (!cur || cur.released || !cur.userId) return null;
    owner = cur.holdsSlot || live ? cur.userId : null;
    return { ...cur, released: true };
  }, guildId);
  if (!claimed || !owner) return null;
  await decrementUserTicketCount(owner, guildId);
  return owner;
}
async function dropTicket(channelId, guildId) {
  await releaseTicketSlot(channelId, guildId);
  await deleteTicket(channelId, guildId);
}
async function deleteTicketChannel(channel, channelId, guildId) {
  if (!channel) return;
  try { await channel.delete(); } catch (e) { if (e?.code !== 10003) return; }
  await deleteTicket(channelId, guildId);
}

const _ticketsOpening = new Map();
const _ticketPanelRef = "1564602855665434634";

async function _resolvePanelChannel(guild) {
  if (!_ticketPanelRef) return null;
  const _findPanel = () => guild.channels.cache.get(_ticketPanelRef) || guild.channels.cache.find(c => c.name === _ticketPanelRef || c.name === _ticketPanelRef.replace(/^#/, ''));
  let panelChannel = _findPanel();
  if (!panelChannel) {
    try { await guild.channels.fetch(); panelChannel = _findPanel(); } catch {}
  }
  return panelChannel || null;
}

function _ticketPanelPayload() {
  const embed = new EmbedBuilder()
    .setTitle(TICKET_CONFIG.messages.panelTitle)
    .setDescription(TICKET_CONFIG.messages.panelDescription)
    .setColor(VB_COLORS.ticket)
    .setFooter({ text: 'Click a button to create a ticket' });

  const rows = [];
  let currentRow = new ActionRowBuilder();
  TICKET_CONFIG.categories.forEach((category) => {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_create_${category.id}`)
        .setLabel(category.name)
        .setEmoji(category.emoji)
        .setStyle(ButtonStyle.Secondary)
    );
  });
  if (currentRow.components.length > 0) rows.push(currentRow);
  return { embeds: [embed], components: rows };
}

async function createTicketPanel(guild) {
  const panelChannel = await _resolvePanelChannel(guild);
  if (!panelChannel || typeof panelChannel.send !== 'function') return null;
  return await panelChannel.send(_ticketPanelPayload());
}

client.once('clientReady', async () => {
  console.log(`[Bot Online] Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    try {
      if (global.__setupCommands.length > 0) {
        await guild.commands.set(global.__setupCommands);
      }
      const posted = await botData.get('ticket_panel', 'meta', guild.id);
      if (!posted) {
        const message = await createTicketPanel(guild);
        if (message) {
          await botData.set('ticket_panel', 'meta', { messageId: message.id, channelId: message.channelId ?? null, postedAt: Date.now() }, guild.id);
        }
      }
    } catch (e) {
      console.error('Initialization error:', e);
    }
  }
});

const ticketCmd = new SlashCommandBuilder().setName('ticket').setDescription('Open a support ticket');
global.__setupCommands.push(ticketCmd.toJSON());

const ticketPanelCmd = new SlashCommandBuilder().setName('ticketpanel').setDescription('Post ticket panel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
global.__setupCommands.push(ticketPanelCmd.toJSON());

client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild()) return;

  // Handle Ticket Panel / Creation / Close / Claim
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticketpanel') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await createTicketPanel(interaction.guild);
    if (message) {
      await interaction.editReply({ content: `✅ Ticket panel posted in <#${message.channelId}>` });
    } else {
      await interaction.editReply({ content: '❌ Failed to post panel.' });
    }
    return;
  }

  const _isTicketCmd = interaction.isChatInputCommand() && interaction.commandName === 'ticket';
  if (interaction.isButton() || _isTicketCmd) {
    if (interaction.customId?.startsWith('ticket_create_') || _isTicketCmd) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const category = TICKET_CONFIG.categories[0];
      const guildId = interaction.guild.id;
      const _ticketLimit = 1;
      
      let _slot = await claimUserTicketSlot(interaction.user.id, guildId, _ticketLimit);
      if (!_slot) {
        return interaction.editReply({ content: 'You already have the maximum number of open tickets!' });
      }

      const ticketCounter = await incrementTicketCounter(guildId);
      const ticketName = sanitizeChannelName(`ticket-${ticketCounter}`);

      let ticketChannel;
      try {
        ticketChannel = await interaction.guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: TICKET_CONFIG.categoryParent,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: client.user.id, type: 1, allow: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, type: 1, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ..._effectiveRoles(category).map(_rid => ({ id: _rid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }))
          ],
        });
      } catch (err) {
        await decrementUserTicketCount(interaction.user.id, guildId);
        return interaction.editReply({ content: '❌ Could not create ticket channel.' });
      }

      await setTicket(ticketChannel.id, {
        id: ticketCounter,
        channelId: ticketChannel.id,
        userId: interaction.user.id,
        categoryId: category.id,
        createdAt: Date.now(),
        holdsSlot: true
      }, guildId);

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.name}`)
        .setDescription(TICKET_CONFIG.messages.welcomeMessage.replace('{user}', `<@${interaction.user.id}>`).replace('{category}', category.name))
        .setColor(VB_COLORS.ticket);

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ embeds: [welcomeEmbed], components: [actionRow] });
      return interaction.editReply({ content: `Your ticket has been created: <#${ticketChannel.id}>` });
    }

    if (interaction.customId === 'ticket_claim') {
      await interaction.deferUpdate().catch(() => {});
      const ticket = await getTicket(interaction.channel.id, interaction.guild.id);
      if (!ticket) return;
      ticket.claimed = interaction.user.id;
      await setTicket(interaction.channel.id, ticket, interaction.guild.id);
      return interaction.followUp({ content: `This ticket has been claimed by <@${interaction.user.id}>` });
    }

    if (interaction.customId === 'ticket_close') {
      await interaction.deferUpdate().catch(() => {});
      const guildId = interaction.guild.id;
      const ticket = await botData.get(interaction.channel.id, 'ticket', guildId);
      if (!ticket) return;

      if (!ticket.released) {
        await interaction.followUp({ content: TICKET_CONFIG.messages.closeMessage });
        await releaseTicketSlot(interaction.channel.id, guildId, true);
      }
      const ch = interaction.channel;
      safeTimeout(() => deleteTicketChannel(ch, ch.id, guildId).catch(() => {}), 5000);
    }
  }

  // ==========================================
  // 2. نموذج إثبات الهوية (Form Validation)
  // ==========================================
  if (interaction.isChatInputCommand() && interaction.commandName === "اثبات-هوية") {
    if (!interaction.member?.roles?.cache?.has("1564562904538157157")) {
      return interaction.reply({ content: '❌ You do not have permission to use this form.', flags: MessageFlags.Ephemeral });
    }
    const modal = new ModalBuilder()
      .setCustomId("form_اثبات-هوية")
      .setTitle("اثبات الهوية")
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('form_q0').setLabel("اسمك داخل اللعبة ؟").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('form_q1').setLabel("عمرك ؟").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('form_q2').setLabel("ماذا تعرف عن فريق SWAT?").setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "form_اثبات-هوية") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const submissionChannel = interaction.guild.channels.cache.get("1566228849098756307");
    
    const embed = new EmbedBuilder()
      .setTitle("📋 اثبات الهوية Submission")
      .setColor("#5865F2")
      .addFields(
        { name: "اسمك داخل اللعبة ؟", value: interaction.fields.getTextInputValue('form_q0') },
        { name: "عمرك ؟", value: interaction.fields.getTextInputValue('form_q1') },
        { name: "ماذا تعرف عن فريق SWAT?", value: interaction.fields.getTextInputValue('form_q2') }
      );

    if (submissionChannel) {
      await submissionChannel.send({ content: "<@&1564561961503686718>", embeds: [embed] });
    }
    
    await botData.set(interaction.user.id, "form_اثبات-هوية", { submitted: true }, interaction.guild.id);
    try { await interaction.user.send("مبروك لك لقد اجتزت مرحلة التعريف بلهوية بنجاح نتمنى لك مستقبل مشرق"); } catch {}
    await interaction.editReply({ content: "مبروك لك لقد اجتزت مرحلة التعريف بلهوية بنجاح نتمنى لك مستقبل مشرق" });
  }
});

const formCmd = new SlashCommandBuilder().setName("اثبات-هوية").setDescription("نموذج إثبات الهوية والشفافية لفريق SWAT");
global.__setupCommands.push(formCmd.toJSON());

client.login(process.env.MTU2NDAxNDg2Mzk1OTcyNDExNA.GjeWpZ.Lt97Nag1vGoihHOQHGec_9F99VPwBusXi_57aw);
