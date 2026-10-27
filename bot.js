const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');
const fs2 = require('fs');

// Limpiar sesión corrupta al arrancar para forzar QR nuevo
const AUTH_DIR = 'auth_info_baileys';
if (fs2.existsSync(AUTH_DIR)) {
  fs2.rmSync(AUTH_DIR, { recursive: true, force: true });
  console.log('sesion anterior eliminada, generando QR limpio...');
}

const app = express();
const PORT = process.env.PORT || 3000;

const IMG_INICIO   = 'https://firebasestorage.googleapis.com/v0/b/invitartes-bot.firebasestorage.app/o/neuroinicio.webp?alt=media&token=3af3306b-40c0-4d94-83c7-9b53e904b843';
const IMG_PAGINA   = 'https://firebasestorage.googleapis.com/v0/b/invitartes-bot.firebasestorage.app/o/neuropagina.webp?alt=media&token=7d2ab41a-788e-4462-a5f4-773e4710af8c';
const IMG_MENU_QR  = 'https://firebasestorage.googleapis.com/v0/b/invitartes-bot.firebasestorage.app/o/neuromenu.webp?alt=media&token=3d5e0d5c-f771-4363-8c7d-f8242e479d10';
const IMG_ABONO    = 'https://firebasestorage.googleapis.com/v0/b/invitartes-bot.firebasestorage.app/o/neuroabono.webp?alt=media&token=8a69ecc0-4f46-4f83-a078-71c9268cb42f';

const DUENO_JID = '593959995788@s.whatsapp.net';

const usuarios = new Map();
const procesando = new Set();

let sock;
let qrCodeData = '';
let isConnected = false;

app.get('/', async (req, res) => {
  if (isConnected) {
    res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Neuroproductos Bot</title><style>body{font-family:system-ui;background:linear-gradient(135deg,#128C7E,#25D366);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}.c{background:white;padding:2rem;border-radius:20px;text-align:center;max-width:500px}h1{color:#128C7E}</style></head><body><div class="c"><h1>✅ Bot conectado y activo</h1><p>El bot de Neuroproductos está funcionando correctamente.</p></div></body></html>');
  } else if (qrCodeData) {
    res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="5"><title>Conectar Neuroproductos</title><style>body{font-family:system-ui;background:linear-gradient(135deg,#128C7E,#25D366);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}.c{background:white;padding:2rem;border-radius:20px;text-align:center;max-width:500px}h1{color:#128C7E}img{max-width:280px}</style></head><body><div class="c"><h1>📱 Conectar WhatsApp</h1><img src="' + qrCodeData + '" alt="QR"><p>Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo</p><p style="font-size:13px;color:#aaa">Se actualiza cada 5 segundos</p></div></body></html>');
  } else {
    res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="5"><title>Neuroproductos Bot</title><style>body{font-family:system-ui;background:linear-gradient(135deg,#128C7E,#25D366);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}.c{background:white;padding:2rem;border-radius:20px;text-align:center;max-width:500px}h1{color:#128C7E}</style></head><body><div class="c"><h1>⏳ Iniciando bot...</h1><p>Por favor espera, generando QR...</p></div></body></html>');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', connected: isConnected });
});

app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));

async function enviarTexto(jid, texto) {
  await sock.sendMessage(jid, { text: texto });
}

async function enviarImagen(jid, url, caption) {
  await sock.sendMessage(jid, { image: { url }, caption: caption || '' });
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getUsuario(jid) {
  if (!usuarios.has(jid)) {
    usuarios.set(jid, { etapa: 'inicio', duenoAtendio: false });
  }
  return usuarios.get(jid);
}

async function enviarMenuInicial(jid) {
  await enviarImagen(jid, IMG_INICIO, '🍽️ ¡Hola! Bienvenido a *Neuroproductos*.\n\nCreamos páginas web profesionales para restaurantes que atraen más clientes y generan más pedidos. 🚀\n\n¿Qué deseas hacer?\n\n1️⃣ Ver ejemplos de nuestro trabajo\n2️⃣ Ver qué incluye y precio\n3️⃣ Hablar con un asesor');
  getUsuario(jid).etapa = 'menu_principal';
}

async function enviarEjemplos(jid) {
  await enviarTexto(jid, '¡Hola! 😊 A continuación te compartimos dos ejemplos de nuestro trabajo para que veas la calidad de lo que hacemos.\n\nEl primero es la *landing page completa* que te ofrecemos, y el segundo es el *menú digital interactivo con QR* que viene incluido en esa misma propuesta. ¡Échales un vistazo! 👇');
  await delay(1000);
  await enviarImagen(jid, IMG_PAGINA, '🌐 *Ejemplo 1 — Landing page completa*\nEnchanted Play Bistro, restaurante temático en Cuenca.\nCarta digital, historia del lugar y reservas directas por WhatsApp.\n👉 https://enchantedplaybistro.com/');
  await delay(1500);
  await enviarImagen(jid, IMG_MENU_QR, '🍽️ *Ejemplo 2 — Menú digital interactivo con QR*\nSus clientes lo escanean desde la mesa. Sin papeles, siempre actualizado y con el estilo de tu restaurante.\n👉 https://enchantedplaybistro.com/menu/');
  await delay(1500);
  await enviarTexto(jid, '✨ *¿Qué incluye tu página web?*\n\n✅ Diseño profesional con tu identidad visual\n✅ Menú digital interactivo\n✅ Código QR imprimible para tus mesas (formato A5)\n✅ Botón de reservas directo a WhatsApp\n✅ Optimizada para celular\n✅ Dominio y hosting el primer año\n✅ Revisiones hasta que quedes 100% satisfecho/a\n\n¿Qué deseas hacer?\n\n1️⃣ Ver precio\n2️⃣ Hablar con un asesor');
  getUsuario(jid).etapa = 'post_ejemplos';
}

async function enviarPrecio(jid) {
  await enviarImagen(jid, IMG_ABONO, '💰 *Inversión total: $130*\n🤝 Empiezas con solo *$10 de abono* y el resto al entregar.\n\n🚀 *¿Por qué vale la pena para tu restaurante?*\n\n📈 Más clientes: apareces profesional en Google y redes sociales\n📲 Más pedidos: tus clientes pueden ver tu menú y escribirte directo por WhatsApp desde la página\n⭐ Más confianza: un restaurante con página web transmite seriedad y calidad\n🍽️ Menú siempre actualizado: sin imprimir cartas cada vez que cambias algo\n\n*Trabajamos contigo hasta que el resultado final te deje 100% satisfecho/a.* ✨\n\n¿Qué deseas hacer?\n\n1️⃣ Quiero empezar\n2️⃣ ¿A dónde transfiero el abono?\n3️⃣ Hablar con un asesor');
  getUsuario(jid).etapa = 'post_precio';
}

async function enviarDatosBancarios(jid) {
  await enviarTexto(jid, '🏦 *Datos para el abono de $10:*\n\n🏦 Banco Pichincha\n💳 Cuenta: 2216652652\n🪪 Cédula: 1104753122\n👤 Titular: ALVAREZ GRANDA, GUIDO CRISTOPHER\n\nUna vez realizado el abono, cuéntanos el nombre de tu restaurante y comenzamos de inmediato. 🚀\n\nSi tienes alguna duda, estamos para servirte. 😊');
  getUsuario(jid).etapa = 'esperando_abono';
}

async function enviarInicioProyecto(jid) {
  await enviarTexto(jid, '🎉 ¡Excelente decisión! Para apartar tu lugar realizas un abono de *$10*:\n\n🏦 *Banco Pichincha*\n💳 Cuenta: 2216652652\n🪪 Cédula: 1104753122\n👤 Titular: ALVAREZ GRANDA, GUIDO CRISTOPHER\n\nUna vez realizado el abono, cuéntanos el nombre de tu restaurante y comenzamos de inmediato. 🚀\n\nSi tienes alguna duda, estamos para servirte. 😊');
  getUsuario(jid).etapa = 'esperando_abono';
}

async function notificarDueno(jid, mensaje) {
  await sock.sendMessage(DUENO_JID, { text: '🔔 *Cliente solicitó asesor*\n📱 Número: ' + jid.replace('@s.whatsapp.net', '') + '\n💬 Mensaje: ' + mensaje });
  await enviarTexto(jid, '👋 Perfecto, en breve un asesor se pondrá en contacto contigo. ¡Gracias por tu interés! 😊');
  getUsuario(jid).etapa = 'esperando_asesor';
}

function programarSeguimientos(jid) {
  setTimeout(async () => {
    const u = getUsuario(jid);
    if (u.duenoAtendio || u.etapa === 'esperando_abono' || u.etapa === 'esperando_asesor' || u.etapa === 'en_proceso') return;
    await enviarImagen(jid, IMG_PAGINA, '👋 ¡Hola! Solo quería compartirte este ejemplo de lo que podemos hacer para tu restaurante. 🍽️\n👉 https://enchantedplaybistro.com/\n\n¿Te gustaría algo así? Puedo contarte más detalles. 😊');
  }, 7 * 60 * 1000);

  const manana10am = new Date();
  manana10am.setDate(manana10am.getDate() + 1);
  manana10am.setHours(10, 0, 0, 0);
  setTimeout(async () => {
    const u = getUsuario(jid);
    if (u.duenoAtendio || u.etapa === 'esperando_abono' || u.etapa === 'esperando_asesor' || u.etapa === 'en_proceso') return;
    await enviarTexto(jid, '🌞 ¡Buenos días! Queríamos saber si pudo revisar la información sobre la página web para su restaurante. ¿Tiene alguna pregunta? Con gusto le ayudamos. 😊');
  }, manana10am.getTime() - Date.now());

  setTimeout(async () => {
    const u = getUsuario(jid);
    if (u.duenoAtendio || u.etapa === 'esperando_abono' || u.etapa === 'esperando_asesor' || u.etapa === 'en_proceso') return;
    await enviarImagen(jid, IMG_MENU_QR, '🍽️ ¿Sabías que cada vez más restaurantes están reemplazando el menú físico por uno digital con código QR?\n\nSus clientes lo escanean desde la mesa, sin necesidad de tocar nada. Siempre actualizado, con fotos y el estilo de tu local. ✨\n\nTe lo hacemos incluido en tu página web. ¿Hablamos? 😊');
  }, 3 * 24 * 60 * 60 * 1000);

  setTimeout(async () => {
    const u = getUsuario(jid);
    if (u.duenoAtendio || u.etapa === 'esperando_abono' || u.etapa === 'esperando_asesor' || u.etapa === 'en_proceso') return;
    await enviarTexto(jid, '👋 ¡Hola! Le saluda Cristopher de Neuroproductos. Hace unos días nos consultó sobre una página web para su restaurante.\n\nSi sigue interesado/a, con gusto retomamos. El proceso es sencillo, empezamos con solo $10 de abono y trabajamos hasta que quede 100% satisfecho/a. 🙌\n\n¿Le gustaría que le cuente más detalles?');
  }, 7 * 24 * 60 * 60 * 1000);
}

async function procesarMensaje(jid, texto) {
  if (procesando.has(jid)) return;
  procesando.add(jid);
  try {
    const u = getUsuario(jid);
    if (u.duenoAtendio) return;
    const msg = texto.trim().toLowerCase();
    const esOpcion = (n) => msg === n || msg === (n + '.') || msg.startsWith(n + ' ');

    const saludos = ['hola','buenas','buenos días','buenas tardes','buenas noches','info','información','informacion','quiero más información','quiero mas informacion'];
    if (u.etapa === 'inicio' || saludos.some(s => msg.includes(s))) {
      await enviarMenuInicial(jid);
      programarSeguimientos(jid);
      return;
    }

    if (u.etapa === 'menu_principal') {
      if (esOpcion('1')) { await enviarEjemplos(jid); }
      else if (esOpcion('2')) { await enviarEjemplos(jid); }
      else if (esOpcion('3')) { await notificarDueno(jid, texto); }
      else { await enviarMenuInicial(jid); }
      return;
    }

    if (u.etapa === 'post_ejemplos') {
      if (esOpcion('1')) { await enviarPrecio(jid); }
      else if (esOpcion('2')) { await notificarDueno(jid, texto); }
      else { await enviarTexto(jid, 'Responde con *1* o *2* según lo que necesites. 😊'); }
      return;
    }

    if (u.etapa === 'post_precio') {
      if (esOpcion('1')) { await enviarInicioProyecto(jid); }
      else if (esOpcion('2')) { await enviarDatosBancarios(jid); }
      else if (esOpcion('3')) { await notificarDueno(jid, texto); }
      else { await enviarTexto(jid, 'Responde con *1*, *2* o *3* según lo que necesites. 😊'); }
      return;
    }

    if (u.etapa === 'esperando_abono') {
      await notificarDueno(jid, texto);
      await enviarTexto(jid, '¡Recibido! Un asesor revisará tu abono y te contactará pronto para comenzar con tu página web. 🚀');
      u.etapa = 'en_proceso';
      return;
    }

    await enviarMenuInicial(jid);
  } finally {
    procesando.delete(jid);
  }
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false, browser: ['Neuroproductos Bot', 'Chrome', '1.0.0'], syncFullHistory: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) { qrCodeData = await qrcode.toDataURL(qr); isConnected = false; console.log('📱 QR generado'); }
    if (connection === 'open') { isConnected = true; qrCodeData = ''; console.log('✅ Bot Neuroproductos conectado'); }
    if (connection === 'close') {
      isConnected = false; qrCodeData = '';
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log('❌ Desconectado (' + code + '). Reconectando: ' + shouldReconnect);
      if (shouldReconnect) setTimeout(conectar, 5000);
    }
  });
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) {
        const jid = msg.key.remoteJid;
        if (jid && jid !== DUENO_JID && !jid.includes('g.us')) getUsuario(jid).duenoAtendio = true;
        continue;
      }
      const jid = msg.key.remoteJid;
      if (!jid || jid.includes('g.us') || jid === 'status@broadcast') continue;
      const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
      if (!texto) continue;
      await procesarMensaje(jid, texto);
    }
  });
}

conectar();
