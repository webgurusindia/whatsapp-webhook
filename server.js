/**
 * Akash Storage & Distribution Services
 * WhatsApp Webhook Server
 *
 * Phase 2 — Webhook verification + message logging
 * Phase 3 — Airtable lead storage         (stubs marked TODO-P3)
 * Phase 4 — Claude AI reply               (stubs marked TODO-P4)
 */

'use strict';

require('dotenv').config();
const express = require('express');
const axios   = require('axios');

const app = express();
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
const {
  PHONE_NUMBER_ID,
  WA_ACCESS_TOKEN,
  WEBHOOK_VERIFY_TOKEN,
  PORT = 3000,
} = process.env;

const WA_API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Akash WhatsApp Webhook', phase: 2 });
});

// ── GET /webhook — Meta verification handshake ────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verification successful ✓');
    res.status(200).send(challenge);
  } else {
    console.warn('[WEBHOOK] Verification FAILED — token mismatch');
    res.status(403).send('Forbidden');
  }
});

// ── POST /webhook — incoming WhatsApp events ──────────────────────────────────
app.post('/webhook', async (req, res) => {
  // Always acknowledge immediately — Meta retries if it doesn't get 200
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of (body.entry || [])) {
    for (const change of (entry.changes || [])) {
      const value = change.value;

      // ── Incoming message ─────────────────────────────────────────────────
      const messages = value?.messages;
      if (messages && messages.length > 0) {
        for (const msg of messages) {
          await handleIncomingMessage(msg, value.metadata);
        }
      }

      // ── Message status updates (delivered, read, failed) ─────────────────
      const statuses = value?.statuses;
      if (statuses && statuses.length > 0) {
        for (const status of statuses) {
          logStatus(status);
        }
      }
    }
  }
});

// ── Handle a single incoming message ─────────────────────────────────────────
async function handleIncomingMessage(msg, metadata) {
  const from      = msg.from;                          // sender's phone number
  const msgId     = msg.id;
  const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();
  const type      = msg.type;                          // text | image | audio | …

  let text = '';
  if (type === 'text')  text = msg.text?.body || '';
  if (type === 'image') text = '[Image received]';
  if (type === 'audio') text = '[Voice note received]';
  if (type === 'document') text = '[Document received]';

  console.log(`\n[${timestamp}] ← FROM ${from} (${type}): ${text}`);

  // ── Mark message as read ─────────────────────────────────────────────────
  await markRead(msgId);

  // ── TODO-P3: save lead + chat to Airtable ───────────────────────────────
  // await saveLead({ from, text, timestamp, msgId });
  // await saveChatMessage({ from, text, timestamp, msgId, direction: 'inbound' });

  // ── TODO-P4: send to Claude, get reply, send back to WhatsApp ───────────
  // const reply = await getClaudeReply(from, text);
  // await sendWhatsAppMessage(from, reply);

  // ── Phase 2 auto-reply (simple acknowledgement) ──────────────────────────
  await sendWhatsAppMessage(from, buildAckMessage(from));
}

// ── Build Phase-2 acknowledgement message ────────────────────────────────────
function buildAckMessage(_from) {
  return (
    '👋 Hi! Thank you for reaching out to *Akash Storage & Distribution Services*.\n\n' +
    'We have received your message and our team will get back to you shortly.\n\n' +
    '🕒 Office hours: Mon–Sat, 9:30 AM – 6:30 PM\n' +
    '📞 Direct call: +91 93218 70431\n\n' +
    '_This is an automated acknowledgement. A real person will follow up soon._'
  );
}

// ── Send a WhatsApp text message ──────────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  try {
    const res = await axios.post(
      WA_API_URL,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[SEND] → ${to}: message sent (id: ${res.data?.messages?.[0]?.id})`);
  } catch (err) {
    console.error('[SEND] Error:', err.response?.data || err.message);
  }
}

// ── Mark a message as read ────────────────────────────────────────────────────
async function markRead(messageId) {
  try {
    await axios.post(
      WA_API_URL,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      {
        headers: {
          Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (_) {
    // non-critical — ignore
  }
}

// ── Log delivery/read status updates ─────────────────────────────────────────
function logStatus(status) {
  console.log(`[STATUS] ${status.id} → ${status.status} (recipient: ${status.recipient_id})`);
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Akash WhatsApp Webhook  —  Phase 2 Active  ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`Listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook\n`);
});
