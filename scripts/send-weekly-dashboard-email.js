#!/usr/bin/env node

const DEFAULT_RECIPIENT = 'sales@nunox.io';
const DEFAULT_DASHBOARD_URL = 'https://sales.nunox-ai.com/dashboard.html';

function taipeiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildEmail({ date = taipeiDate(), to = DEFAULT_RECIPIENT, dashboardUrl = DEFAULT_DASHBOARD_URL } = {}) {
  return {
    to,
    subject: `NunoX Weekly Business Dashboard - ${date}`,
    text: [
      `NunoX Weekly Business Dashboard - ${date}`,
      '',
      'The weekly business dashboard has been updated.',
      '',
      `Dashboard: ${dashboardUrl}`,
      '',
      'Best,',
      'Nikkie',
    ].join('\n'),
  };
}

async function main() {
  const { sendMessage } = require('/Users/jacai/.openclaw/workspace/skills/google-workspace/scripts/google-gmail');
  const dryRun = process.argv.includes('--dry-run');
  const dateArgIndex = process.argv.indexOf('--date');
  const date = dateArgIndex >= 0 ? process.argv[dateArgIndex + 1] : taipeiDate();
  const payload = buildEmail({
    date,
    to: process.env.WEEKLY_DASHBOARD_EMAIL_TO || DEFAULT_RECIPIENT,
    dashboardUrl: process.env.WEEKLY_DASHBOARD_URL || DEFAULT_DASHBOARD_URL,
  });

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, payload }, null, 2));
    return;
  }

  const result = await sendMessage(payload);
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
    process.exit(1);
  });
}

module.exports = { buildEmail, taipeiDate };
