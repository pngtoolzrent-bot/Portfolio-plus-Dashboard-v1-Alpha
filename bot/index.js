/**
 * bot/index.js
 * Telegram bot — Admin dashboard for Anthony Kuiau's portfolio.
 *
 * Commands / flow:
 *   /start or /menu  → Main menu
 *   Section buttons  → Sub-menus per section
 *   Inline editing   → Guided prompts to update Firebase
 *
 * Sections: Hero · About · Portfolio · Experience · Skills · Contact · Theme
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const TelegramBot = require('node-telegram-bot-api');
const admin       = require('firebase-admin');
const path        = require('path');
const axios       = require('axios');
const FormData    = require('form-data');

/* ── Firebase ── */
const serviceAccount = require(
  process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '../firebase/serviceAccountKey.json')
);
admin.initializeApp({
  credential:    admin.credential.cert(serviceAccount),
  databaseURL:   process.env.FIREBASE_DATABASE_URL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});
const db      = admin.database();
const storage = admin.storage().bucket();

/* ── Bot ── */
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Track per-user conversation state
const sessions = {};

/* ─────────────── HELPERS ─────────────── */

const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(Number).filter(Boolean);

function isAdmin(userId) {
  return ADMIN_IDS.length === 0 || ADMIN_IDS.includes(userId);
}

function dbGet(path) {
  return db.ref(path).once('value').then(s => s.val());
}
function dbSet(path, value) {
  return db.ref(path).set(value);
}
function dbUpdate(path, updates) {
  return db.ref(path).update(updates);
}
function dbPush(path, value) {
  return db.ref(path).push(value);
}
function dbRemove(path) {
  return db.ref(path).remove();
}

function genId(prefix = 'item') {
  return `${prefix}_${Date.now()}`;
}

function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        ['🏠 Hero',       '👤 About'],
        ['🖼  Portfolio',  '💼 Experience'],
        ['🛠  Skills',     '📬 Contact'],
        ['🎨 Theme/Colors','📊 Preview Site']
      ],
      resize_keyboard: true
    }
  };
}

function backBtn(label = '⬅️ Back to Menu') {
  return { reply_markup: { keyboard: [[label]], resize_keyboard: true } };
}

function inlineBack(cb) {
  return { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: cb }]] } };
}

async function uploadImageToStorage(fileId, filename) {
  const fileLink = await bot.getFileLink(fileId);
  const res      = await axios({ url: fileLink, responseType: 'stream' });
  const file     = storage.file(`portfolio/${filename}`);
  await new Promise((resolve, reject) => {
    res.data.pipe(file.createWriteStream({ metadata: { contentType: 'image/jpeg' } }))
      .on('finish', resolve).on('error', reject);
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${storage.name}/portfolio/${filename}`;
}

function session(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { step: null, data: {} };
  return sessions[chatId];
}
function clearSession(chatId) { sessions[chatId] = { step: null, data: {} }; }

/* ─────────────── MAIN MENU ─────────────── */

async function sendMainMenu(chatId) {
  clearSession(chatId);
  await bot.sendMessage(chatId,
    `👋 *Anthony Kuiau — Portfolio Admin*\n\nChoose a section to edit:`,
    { parse_mode: 'Markdown', ...mainMenu() }
  );
}

bot.onText(/\/start|\/menu/, msg => {
  if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, '🚫 Unauthorised.');
  sendMainMenu(msg.chat.id);
});

/* ─────────────── ROUTING ─────────────── */

bot.on('message', async msg => {
  if (!isAdmin(msg.from.id)) return;
  const chatId = msg.chat.id;
  const text   = msg.text || '';
  const sess   = session(chatId);

  // Handle active wizard step first
  if (sess.step) { await handleWizardStep(chatId, msg, sess); return; }

  // Route to section menus
  switch (text) {
    case '🏠 Hero':           return heroMenu(chatId);
    case '👤 About':          return aboutMenu(chatId);
    case '🖼  Portfolio':     return portfolioMenu(chatId);
    case '💼 Experience':     return experienceMenu(chatId);
    case '🛠  Skills':        return skillsMenu(chatId);
    case '📬 Contact':        return contactMenu(chatId);
    case '🎨 Theme/Colors':   return themeMenu(chatId);
    case '📊 Preview Site':   return bot.sendMessage(chatId, `🌐 Your site: ${process.env.SITE_URL || '(set SITE_URL in .env)'}`);
    case '⬅️ Back to Menu':  return sendMainMenu(chatId);
  }
});

bot.on('callback_query', async q => {
  if (!isAdmin(q.from.id)) return;
  const chatId = q.message.chat.id;
  const data   = q.data;
  await bot.answerCallbackQuery(q.id);

  // Back/cancel
  if (data === 'menu')       { clearSession(chatId); return sendMainMenu(chatId); }
  if (data === 'portfolio')  { clearSession(chatId); return portfolioMenu(chatId); }
  if (data === 'experience') { clearSession(chatId); return experienceMenu(chatId); }
  if (data === 'skills')     { clearSession(chatId); return skillsMenu(chatId); }
  if (data === 'contact_socials') { clearSession(chatId); return contactSocialsMenu(chatId); }

  // ── Hero ──
  if (data.startsWith('hero_'))  return heroCallback(chatId, data);
  // ── About ──
  if (data.startsWith('about_')) return aboutCallback(chatId, data);
  // ── Portfolio ──
  if (data.startsWith('port_'))  return portfolioCallback(chatId, data, q.message);
  // ── Experience ──
  if (data.startsWith('exp_'))   return experienceCallback(chatId, data);
  // ── Skills ──
  if (data.startsWith('skill_')) return skillsCallback(chatId, data);
  // ── Contact ──
  if (data.startsWith('contact_')) return contactCallback(chatId, data);
  // ── Theme ──
  if (data.startsWith('theme_')) return themeCallback(chatId, data);
});

/* ═══════════════ HERO ═══════════════ */

async function heroMenu(chatId) {
  const h = await dbGet('/site/hero');
  await bot.sendMessage(chatId, `*🏠 Hero Section*\n\nCurrent values:\n• Tag: \`${h?.tag||'—'}\`\n• Sub: \`${h?.sub||'—'}\`\n• Primary CTA: \`${h?.ctaPrimary?.label||'—'}\`\n• CV URL: \`${h?.ctaSecondary?.href||'—'}\``,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '✏️ Edit Tag line',      callback_data: 'hero_tag' }],
      [{ text: '✏️ Edit Name (HTML)',    callback_data: 'hero_nameHtml' }],
      [{ text: '✏️ Edit Sub-title',      callback_data: 'hero_sub' }],
      [{ text: '✏️ Primary CTA label',   callback_data: 'hero_cta1_label' }],
      [{ text: '✏️ Primary CTA link',    callback_data: 'hero_cta1_href' }],
      [{ text: '✏️ CV Download URL',     callback_data: 'hero_cv_url' }],
      [{ text: '⬅️ Menu', callback_data: 'menu' }]
    ]}});
}

async function heroCallback(chatId, data) {
  const prompts = {
    hero_tag:       { path: '/site/hero/tag',               label: 'Tag line (e.g. Graphic Designer & Radio Presenter)' },
    hero_nameHtml:  { path: '/site/hero/nameHtml',          label: 'Name HTML (e.g. Anthony<br/><em>Kuiau</em>)' },
    hero_sub:       { path: '/site/hero/sub',               label: 'Sub-title (e.g. Port Moresby, Papua New Guinea)' },
    hero_cta1_label:{ path: '/site/hero/ctaPrimary/label',  label: 'Primary button label' },
    hero_cta1_href: { path: '/site/hero/ctaPrimary/href',   label: 'Primary button link' },
    hero_cv_url:    { path: '/site/hero/ctaSecondary/href', label: 'CV Google Drive URL' },
  };
  const p = prompts[data];
  if (!p) return;
  session(chatId).step = { type: 'set_value', dbPath: p.path, back: 'menu' };
  await bot.sendMessage(chatId, `✏️ *${p.label}*\n\nSend the new value:`, { parse_mode: 'Markdown', ...inlineBack('menu') });
}

/* ═══════════════ ABOUT ═══════════════ */

async function aboutMenu(chatId) {
  await bot.sendMessage(chatId, `*👤 About Section*`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '✏️ Heading',         callback_data: 'about_heading' }],
      [{ text: '✏️ Paragraph 1',     callback_data: 'about_p0' }],
      [{ text: '✏️ Paragraph 2',     callback_data: 'about_p1' }],
      [{ text: '➕ Add Paragraph',   callback_data: 'about_add_p' }],
      [{ text: '📊 Edit Stats',      callback_data: 'about_stats' }],
      [{ text: '⬅️ Menu', callback_data: 'menu' }]
    ]}});
}

async function aboutCallback(chatId, data) {
  if (data === 'about_heading') {
    session(chatId).step = { type: 'set_value', dbPath: '/site/about/heading', back: 'menu' };
    return bot.sendMessage(chatId, '✏️ New heading text:', inlineBack('menu'));
  }
  if (data.startsWith('about_p')) {
    const idx = parseInt(data.replace('about_p',''));
    session(chatId).step = { type: 'set_value', dbPath: `/site/about/paragraphs/${idx}`, back: 'menu' };
    return bot.sendMessage(chatId, `✏️ Paragraph ${idx+1} text:`, inlineBack('menu'));
  }
  if (data === 'about_add_p') {
    const paras = await dbGet('/site/about/paragraphs') || [];
    session(chatId).step = { type: 'set_value', dbPath: `/site/about/paragraphs/${paras.length}`, back: 'menu' };
    return bot.sendMessage(chatId, '✏️ New paragraph text:', inlineBack('menu'));
  }
  if (data === 'about_stats') {
    const stats = await dbGet('/site/about/stats') || [];
    let msg = '*📊 Current Stats:*\n';
    stats.forEach((s,i) => { msg += `\n${i+1}. \`${s.value}\` — ${s.label}`; });
    const kb = stats.map((s,i) => [{ text: `✏️ Edit stat ${i+1}`, callback_data: `about_stat_${i}` }]);
    kb.push([{ text: '➕ Add stat', callback_data: 'about_stat_add' }]);
    kb.push([{ text: '⬅️ Menu', callback_data: 'menu' }]);
    return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
  }
  if (data.startsWith('about_stat_')) {
    if (data === 'about_stat_add') {
      const stats = await dbGet('/site/about/stats') || [];
      session(chatId).step = { type: 'stat_add', idx: stats.length };
      return bot.sendMessage(chatId, '➕ New stat — send value (e.g. `5+`):', { parse_mode:'Markdown', ...inlineBack('menu') });
    }
    const idx = parseInt(data.replace('about_stat_',''));
    session(chatId).step = { type: 'stat_edit', idx, field: 'value' };
    return bot.sendMessage(chatId, `✏️ Stat ${idx+1} — send new *value* (e.g. \`4+\`):`, { parse_mode:'Markdown', ...inlineBack('menu') });
  }
}

/* ═══════════════ PORTFOLIO ═══════════════ */

async function portfolioMenu(chatId) {
  const items = await dbGet('/site/portfolio/items') || {};
  const list  = Object.values(items).sort((a,b)=>(a.order||0)-(b.order||0));

  let msg = `*🖼 Portfolio* (${list.length} projects)\n\nSelect a project to edit or add a new one:`;
  const kb = list.map(item => [{ text: `${item.visible!==false?'✅':'🙈'} ${item.title}`, callback_data: `port_edit_${item.id}` }]);
  kb.push([{ text: '➕ Add New Project', callback_data: 'port_add' }]);
  kb.push([{ text: '⬅️ Menu', callback_data: 'menu' }]);

  await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
}

async function portfolioCallback(chatId, data, msg) {
  // Add new
  if (data === 'port_add') {
    session(chatId).step = { type: 'port_add', field: 'title' };
    session(chatId).data = {};
    return bot.sendMessage(chatId, '➕ *New Project*\n\nStep 1/4 — Enter project *title*:', { parse_mode:'Markdown', ...inlineBack('portfolio') });
  }

  // Edit existing
  if (data.startsWith('port_edit_')) {
    const id    = data.replace('port_edit_', '');
    const item  = await dbGet(`/site/portfolio/items/${id}`);
    if (!item) return bot.sendMessage(chatId, '❌ Project not found.');
    const vis   = item.visible !== false ? '✅ Visible' : '🙈 Hidden';
    const media = item.media?.type === 'youtube' ? '📺 YouTube' : item.media?.url ? '🖼 Image' : '—';
    await bot.sendMessage(chatId,
      `*${item.title}*\nCategory: ${item.category||'—'}\nMedia: ${media}\nStatus: ${vis}\n\nWhat to do?`,
      { parse_mode:'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '✏️ Title',          callback_data: `port_field_${id}_title` }],
        [{ text: '✏️ Category',       callback_data: `port_field_${id}_category` }],
        [{ text: '✏️ Description',    callback_data: `port_field_${id}_description` }],
        [{ text: '🖼 Replace Image',  callback_data: `port_media_${id}_image` }],
        [{ text: '📺 Set YouTube URL',callback_data: `port_media_${id}_youtube` }],
        [{ text: '🔄 Toggle Visible', callback_data: `port_toggle_${id}` }],
        [{ text: '🗑 Delete Project',  callback_data: `port_delete_${id}` }],
        [{ text: '⬅️ Portfolio',      callback_data: 'portfolio' }]
      ]}});
    return;
  }

  if (data.startsWith('port_field_')) {
    const [,,,id,field] = data.split('_');
    session(chatId).step = { type: 'port_field', id, field };
    return bot.sendMessage(chatId, `✏️ New value for *${field}*:`, { parse_mode:'Markdown', ...inlineBack('portfolio') });
  }

  if (data.startsWith('port_media_')) {
    const parts  = data.split('_'); // ['port','media',id,type]
    const id     = parts[2];
    const mtype  = parts[3];
    if (mtype === 'youtube') {
      session(chatId).step = { type: 'port_youtube', id };
      return bot.sendMessage(chatId, '📺 Send the *YouTube URL* (e.g. https://youtu.be/xxxxx):', { parse_mode:'Markdown', ...inlineBack('portfolio') });
    } else {
      session(chatId).step = { type: 'port_image', id };
      return bot.sendMessage(chatId, '🖼 Send the *image* as a photo or file:', { parse_mode:'Markdown', ...inlineBack('portfolio') });
    }
  }

  if (data.startsWith('port_toggle_')) {
    const id   = data.replace('port_toggle_', '');
    const item = await dbGet(`/site/portfolio/items/${id}`);
    const next = item?.visible === false ? true : false;
    await dbSet(`/site/portfolio/items/${id}/visible`, next);
    await bot.sendMessage(chatId, `${next ? '✅ Project is now visible.' : '🙈 Project is now hidden.'}`);
    return portfolioMenu(chatId);
  }

  if (data.startsWith('port_delete_')) {
    const id = data.replace('port_delete_', '');
    await bot.sendMessage(chatId, '⚠️ Are you sure you want to delete this project?', {
      reply_markup: { inline_keyboard: [
        [{ text: '🗑 Yes, delete', callback_data: `port_confirmdelete_${id}` }],
        [{ text: '❌ Cancel',      callback_data: `port_edit_${id}` }]
      ]}});
    return;
  }

  if (data.startsWith('port_confirmdelete_')) {
    const id = data.replace('port_confirmdelete_', '');
    await dbRemove(`/site/portfolio/items/${id}`);
    await bot.sendMessage(chatId, '🗑 Project deleted.');
    return portfolioMenu(chatId);
  }
}

/* ═══════════════ EXPERIENCE ═══════════════ */

async function experienceMenu(chatId) {
  const tl = await dbGet('/site/experience/timeline') || {};
  const entries = Object.values(tl).sort((a,b)=>(a.order||0)-(b.order||0));
  const kb = entries.map(e => [{ text: `✏️ ${e.title}`, callback_data: `exp_edit_${e.id}` }]);
  kb.push([{ text: '➕ Add Experience', callback_data: 'exp_add' }]);
  kb.push([{ text: '⬅️ Menu', callback_data: 'menu' }]);
  await bot.sendMessage(chatId, `*💼 Work Experience* (${entries.length} entries)`, { parse_mode:'Markdown', reply_markup: { inline_keyboard: kb } });
}

async function experienceCallback(chatId, data) {
  if (data === 'exp_add') {
    session(chatId).step  = { type: 'exp_add', field: 'period' };
    session(chatId).data  = { id: genId('exp') };
    return bot.sendMessage(chatId, '➕ *New Experience*\n\nStep 1/4 — Period (e.g. Jan 2024 – Dec 2024):', { parse_mode:'Markdown', ...inlineBack('experience') });
  }
  if (data.startsWith('exp_edit_')) {
    const id    = data.replace('exp_edit_', '');
    const entry = await dbGet(`/site/experience/timeline/${id}`);
    if (!entry) return bot.sendMessage(chatId, '❌ Not found.');
    await bot.sendMessage(chatId, `*${entry.title}*\n${entry.place}\n${entry.period}`, {
      parse_mode:'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '✏️ Period',      callback_data: `exp_field_${id}_period` }],
        [{ text: '✏️ Title',       callback_data: `exp_field_${id}_title` }],
        [{ text: '✏️ Place',       callback_data: `exp_field_${id}_place` }],
        [{ text: '✏️ Description', callback_data: `exp_field_${id}_desc` }],
        [{ text: '🗑 Delete',       callback_data: `exp_delete_${id}` }],
        [{ text: '⬅️ Back',        callback_data: 'experience' }]
      ]}});
    return;
  }
  if (data.startsWith('exp_field_')) {
    const parts = data.split('_'); // exp_field_{id}_{field}
    const id    = parts[2];
    const field = parts[3];
    session(chatId).step = { type: 'exp_field', id, field };
    return bot.sendMessage(chatId, `✏️ New *${field}*:`, { parse_mode:'Markdown', ...inlineBack('experience') });
  }
  if (data.startsWith('exp_delete_')) {
    const id = data.replace('exp_delete_', '');
    await dbRemove(`/site/experience/timeline/${id}`);
    await bot.sendMessage(chatId, '🗑 Entry deleted.');
    return experienceMenu(chatId);
  }
}

/* ═══════════════ SKILLS ═══════════════ */

async function skillsMenu(chatId) {
  const groups = await dbGet('/site/experience/skills') || [];
  let msg = '*🛠 Skills*\n\nCurrent groups:';
  groups.forEach((g,i) => { msg += `\n${i+1}. *${g.group}* — ${g.tags.join(', ')}`; });
  const kb = groups.map((g,i) => [{ text: `✏️ ${g.group}`, callback_data: `skill_group_${i}` }]);
  kb.push([{ text: '➕ Add Group',  callback_data: 'skill_add_group' }]);
  kb.push([{ text: '⬅️ Menu',      callback_data: 'menu' }]);
  await bot.sendMessage(chatId, msg, { parse_mode:'Markdown', reply_markup: { inline_keyboard: kb } });
}

async function skillsCallback(chatId, data) {
  if (data === 'skill_add_group') {
    session(chatId).step = { type: 'skill_add_group', field: 'name' };
    session(chatId).data = {};
    return bot.sendMessage(chatId, '➕ *New Skill Group*\n\nGroup name (e.g. "Leadership"):', { parse_mode:'Markdown', ...inlineBack('skills') });
  }
  if (data.startsWith('skill_group_')) {
    const idx    = parseInt(data.replace('skill_group_',''));
    const groups = await dbGet('/site/experience/skills') || [];
    const g      = groups[idx];
    if (!g) return;
    await bot.sendMessage(chatId, `*${g.group}*\nTags: ${g.tags.join(', ')}`, {
      parse_mode:'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '✏️ Rename group',   callback_data: `skill_rename_${idx}` }],
        [{ text: '✏️ Edit all tags',  callback_data: `skill_edittags_${idx}` }],
        [{ text: '➕ Add a tag',      callback_data: `skill_addtag_${idx}` }],
        [{ text: '🗑 Delete group',    callback_data: `skill_delgroup_${idx}` }],
        [{ text: '⬅️ Back',           callback_data: 'skills' }]
      ]}});
    return;
  }
  if (data.startsWith('skill_rename_')) {
    const idx = parseInt(data.replace('skill_rename_',''));
    session(chatId).step = { type: 'skill_rename', idx };
    return bot.sendMessage(chatId, '✏️ New group name:', inlineBack('skills'));
  }
  if (data.startsWith('skill_edittags_')) {
    const idx = parseInt(data.replace('skill_edittags_',''));
    session(chatId).step = { type: 'skill_edittags', idx };
    return bot.sendMessage(chatId, '✏️ Send all tags as comma-separated list:\n(e.g. `Figma, Photoshop, Illustrator`)', { parse_mode:'Markdown', ...inlineBack('skills') });
  }
  if (data.startsWith('skill_addtag_')) {
    const idx = parseInt(data.replace('skill_addtag_',''));
    session(chatId).step = { type: 'skill_addtag', idx };
    return bot.sendMessage(chatId, '➕ Tag name to add:', inlineBack('skills'));
  }
  if (data.startsWith('skill_delgroup_')) {
    const idx    = parseInt(data.replace('skill_delgroup_',''));
    const groups = await dbGet('/site/experience/skills') || [];
    groups.splice(idx, 1);
    await dbSet('/site/experience/skills', groups);
    await bot.sendMessage(chatId, '🗑 Group deleted.');
    return skillsMenu(chatId);
  }
}

/* ═══════════════ CONTACT ═══════════════ */

async function contactMenu(chatId) {
  const c = await dbGet('/site/contact');
  await bot.sendMessage(chatId, `*📬 Contact Section*\n\nEmail: \`${c?.email||'—'}\``, {
    parse_mode:'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '✏️ Email address',    callback_data: 'contact_email' }],
      [{ text: '✏️ CV Download URL',  callback_data: 'contact_cv' }],
      [{ text: '✏️ Heading',          callback_data: 'contact_heading' }],
      [{ text: '✏️ Body text',        callback_data: 'contact_body' }],
      [{ text: '🔗 Edit Social Links',callback_data: 'contact_socials' }],
      [{ text: '⬅️ Menu', callback_data: 'menu' }]
    ]}});
}

async function contactCallback(chatId, data) {
  const fields = {
    contact_email:   { path: '/site/contact/email',   label: 'Email address' },
    contact_cv:      { path: '/site/contact/cvUrl',   label: 'CV Download URL' },
    contact_heading: { path: '/site/contact/heading', label: 'Heading text' },
    contact_body:    { path: '/site/contact/body',    label: 'Body paragraph' },
  };
  if (fields[data]) {
    session(chatId).step = { type: 'set_value', dbPath: fields[data].path, back: 'menu' };
    return bot.sendMessage(chatId, `✏️ *${fields[data].label}*:\n\nSend new value:`, { parse_mode:'Markdown', ...inlineBack('menu') });
  }
  if (data === 'contact_socials') return contactSocialsMenu(chatId);
}

async function contactSocialsMenu(chatId) {
  const socials = await dbGet('/site/contact/socials') || [];
  const kb = socials.map((s,i) => [{ text: `✏️ ${s.label}`, callback_data: `contact_social_${i}` }]);
  kb.push([{ text: '➕ Add Social', callback_data: 'contact_social_add' }]);
  kb.push([{ text: '⬅️ Contact',   callback_data: 'menu' }]);
  await bot.sendMessage(chatId, '*🔗 Social Links*', { parse_mode:'Markdown', reply_markup: { inline_keyboard: kb } });
}

/* ═══════════════ THEME ═══════════════ */

async function themeMenu(chatId) {
  const t = await dbGet('/site/theme');
  await bot.sendMessage(chatId,
    `*🎨 Theme / Colors*\n\n\`--ink\`    ${t?.ink||'#111010'}\n\`--paper\`  ${t?.paper||'#F5F2ED'}\n\`--accent\` ${t?.accent||'#C8441B'}\n\`--muted\`  ${t?.muted||'#8A8578'}\n\`--line\`   ${t?.line||'#D9D5CC'}`,
    { parse_mode:'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '🎨 ink (text)',         callback_data: 'theme_ink' }],
      [{ text: '🎨 paper (background)', callback_data: 'theme_paper' }],
      [{ text: '🎨 accent (highlight)', callback_data: 'theme_accent' }],
      [{ text: '🎨 muted (secondary)',  callback_data: 'theme_muted' }],
      [{ text: '🎨 line (borders)',     callback_data: 'theme_line' }],
      [{ text: '🎨 warm (hover bg)',    callback_data: 'theme_warm' }],
      [{ text: '⬅️ Menu', callback_data: 'menu' }]
    ]}});
}

async function themeCallback(chatId, data) {
  const key = data.replace('theme_', '');
  session(chatId).step = { type: 'set_value', dbPath: `/site/theme/${key}`, back: 'menu' };
  await bot.sendMessage(chatId,
    `🎨 New hex color for *--${key}*:\n(e.g. \`#C8441B\`)`,
    { parse_mode:'Markdown', ...inlineBack('menu') }
  );
}

/* ═══════════════ WIZARD HANDLER ═══════════════ */

async function handleWizardStep(chatId, msg, sess) {
  const { step, data: sd } = sess;
  const text  = msg.text || '';
  const photo = msg.photo;
  const doc   = msg.document;

  try {
    /* Generic single value set */
    if (step.type === 'set_value') {
      await dbSet(step.dbPath, text);
      clearSession(chatId);
      await bot.sendMessage(chatId, `✅ Updated!`, mainMenu());
      return;
    }

    /* Stat edit (2 steps: value then label) */
    if (step.type === 'stat_edit') {
      if (step.field === 'value') {
        sd.statValue = text;
        sess.step = { type: 'stat_edit', idx: step.idx, field: 'label' };
        return bot.sendMessage(chatId, '✏️ Now send the *label* (e.g. `Years designing`):', { parse_mode:'Markdown' });
      }
      await dbSet(`/site/about/stats/${step.idx}`, { value: sd.statValue, label: text });
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Stat updated!', mainMenu());
    }

    /* Stat add */
    if (step.type === 'stat_add') {
      if (!sd.statValue) {
        sd.statValue = text;
        sess.step.type = 'stat_add';
        return bot.sendMessage(chatId, '✏️ Label for this stat:');
      }
      await dbSet(`/site/about/stats/${step.idx}`, { value: sd.statValue, label: text });
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Stat added!', mainMenu());
    }

    /* Portfolio add (multi-step wizard) */
    if (step.type === 'port_add') {
      const fields = ['title','category','description'];
      const prompts= ['Step 2/4 — Category (e.g. branding, social, print):', 'Step 3/4 — Short description:', 'Step 4/4 — Media: send a *photo*, paste a YouTube URL, or type `skip`:'];
      const fi = fields.indexOf(step.field);
      sd[step.field] = text;
      if (fi < fields.length - 1) {
        sess.step.field = fields[fi+1];
        return bot.sendMessage(chatId, prompts[fi], { parse_mode:'Markdown' });
      }
      // Final step — media
      sess.step = { type: 'port_add_media' };
      return bot.sendMessage(chatId, prompts[2], { parse_mode:'Markdown' });
    }

    if (step.type === 'port_add_media') {
      const id    = genId('proj');
      const order = Object.keys(await dbGet('/site/portfolio/items') || {}).length + 1;
      let media   = { type: 'image', url: '' };

      if (photo || doc) {
        const fileId = photo ? photo[photo.length-1].file_id : doc.file_id;
        const url    = await uploadImageToStorage(fileId, `${id}.jpg`);
        media = { type: 'image', url, alt: sd.title };
      } else if (text.toLowerCase() !== 'skip') {
        if (text.includes('youtube') || text.includes('youtu.be')) {
          media = { type: 'youtube', url: text };
        } else {
          media = { type: 'image', url: text };
        }
      }
      await dbSet(`/site/portfolio/items/${id}`, { id, title: sd.title, category: sd.category, description: sd.description, media, visible: true, order });
      clearSession(chatId); return bot.sendMessage(chatId, `✅ Project *${sd.title}* added!`, { parse_mode:'Markdown', ...mainMenu() });
    }

    /* Portfolio field edit */
    if (step.type === 'port_field') {
      await dbSet(`/site/portfolio/items/${step.id}/${step.field}`, text);
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Updated!', mainMenu());
    }

    /* Portfolio YouTube */
    if (step.type === 'port_youtube') {
      await dbSet(`/site/portfolio/items/${step.id}/media`, { type: 'youtube', url: text });
      clearSession(chatId); return bot.sendMessage(chatId, '📺 YouTube video set!', mainMenu());
    }

    /* Portfolio image upload */
    if (step.type === 'port_image') {
      if (!photo && !doc) return bot.sendMessage(chatId, '📷 Please send a photo or image file.');
      const fileId = photo ? photo[photo.length-1].file_id : doc.file_id;
      await bot.sendMessage(chatId, '⏳ Uploading...');
      const url = await uploadImageToStorage(fileId, `${step.id}_${Date.now()}.jpg`);
      await dbSet(`/site/portfolio/items/${step.id}/media`, { type: 'image', url, alt: '' });
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Image uploaded!', mainMenu());
    }

    /* Experience add (multi-step) */
    if (step.type === 'exp_add') {
      const fields  = ['period','title','place','desc'];
      const prompts = ['Step 2/4 — Job title:', 'Step 3/4 — Company / Place:', 'Step 4/4 — Description:'];
      const fi = fields.indexOf(step.field);
      sd[step.field] = text;
      if (fi < fields.length - 1) {
        sess.step.field = fields[fi+1];
        return bot.sendMessage(chatId, prompts[fi]);
      }
      const order = Object.keys(await dbGet('/site/experience/timeline') || {}).length + 1;
      const id    = sd.id;
      await dbSet(`/site/experience/timeline/${id}`, { id, period: sd.period, title: sd.title, place: sd.place, desc: sd.desc, order });
      clearSession(chatId); return bot.sendMessage(chatId, `✅ Experience entry added!`, mainMenu());
    }

    /* Experience field edit */
    if (step.type === 'exp_field') {
      await dbSet(`/site/experience/timeline/${step.id}/${step.field}`, text);
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Updated!', mainMenu());
    }

    /* Skills */
    if (step.type === 'skill_rename') {
      const groups = await dbGet('/site/experience/skills') || [];
      groups[step.idx].group = text;
      await dbSet('/site/experience/skills', groups);
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Group renamed!', mainMenu());
    }
    if (step.type === 'skill_edittags') {
      const groups = await dbGet('/site/experience/skills') || [];
      groups[step.idx].tags = text.split(',').map(s => s.trim()).filter(Boolean);
      await dbSet('/site/experience/skills', groups);
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Tags updated!', mainMenu());
    }
    if (step.type === 'skill_addtag') {
      const groups = await dbGet('/site/experience/skills') || [];
      groups[step.idx].tags.push(text.trim());
      await dbSet('/site/experience/skills', groups);
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Tag added!', mainMenu());
    }
    if (step.type === 'skill_add_group') {
      if (step.field === 'name') {
        sd.groupName   = text;
        sess.step.field = 'tags';
        return bot.sendMessage(chatId, '✏️ Tags (comma-separated):');
      }
      const groups = await dbGet('/site/experience/skills') || [];
      groups.push({ group: sd.groupName, tags: text.split(',').map(s=>s.trim()).filter(Boolean) });
      await dbSet('/site/experience/skills', groups);
      clearSession(chatId); return bot.sendMessage(chatId, '✅ Group added!', mainMenu());
    }

  } catch (err) {
    console.error('Wizard error:', err);
    clearSession(chatId);
    await bot.sendMessage(chatId, `❌ Error: ${err.message}\n\nReturning to menu.`, mainMenu());
  }
}

console.log('🤖 Bot is running...');
