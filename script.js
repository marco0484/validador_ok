const SUPABASE_URL =
  "https://caoqqzzwwpiivmqqeigw.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_4FaRj7XuzifYgPa8BjtO8A_C46t5q0Q";

const supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

/* ========================= */
/* USERS */
/* ========================= */

const users = [

  {
    username: "admin",
    password: "admin123",
    role: "Administrador",
    gate: "Control Total"
  },

  {
    username: "marco",
    password: "cosmic2026",
    role: "Scanner",
    gate: "Entrada Principal"
  }

];

let currentUser = null;

/* ========================= */
/* ELEMENTS */
/* ========================= */

const ticketInput =
  document.getElementById("ticketInput");

const validateBtn =
  document.getElementById("validateBtn");

const statusBox =
  document.getElementById("statusBox");

/* ========================= */
/* COUNTERS */
/* ========================= */

let okCount = 0;
let dupCount = 0;
let invalidCount = 0;

let lastScan = "";
let lastScanTime = 0;

/* ========================= */
/* ALERT SOUND */
/* ========================= */

const alertSound =
  new Audio(
    "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
  );

/* ========================= */
/* LOGIN */
/* ========================= */

document
  .getElementById("loginBtn")
  .addEventListener(
    "click",
    login
  );

function login() {

  const username =
    document
      .getElementById("username")
      .value
      .trim();

  const password =
    document
      .getElementById("password")
      .value
      .trim();

  const user =
    users.find(
      u =>
        u.username === username &&
        u.password === password
    );

  /* ❌ INVALID LOGIN */

  if (!user) {

    triggerAlert();

    alert(
      "Usuario o contraseña incorrectos"
    );

    return;

  }

  /* ✅ LOGIN OK */

  currentUser = user;

  document
    .getElementById("loginScreen")
    .style.display = "none";

  document
    .getElementById("scannerApp")
    .style.display = "grid";

  document
    .getElementById("staffDisplay")
    .innerText =
      `${user.username} (${user.role})`;

  addLog(
    `🔐 Login: ${user.username}`
  );

  updateStatus(
    "success",
    "✅ Sesión iniciada",
    `${user.role} | ${user.gate}`
  );

  startScanner();

}

/* ========================= */
/* VALIDATE */
/* ========================= */

async function validateTicket() {

  /* 🔒 LOGIN REQUIRED */

  if (!currentUser) {

    triggerAlert();

    updateStatus(
      "warning",
      "🔒 Inicia sesión",
      "Debes autenticarte primero"
    );

    return;

  }

  let ticketData = null;

  let ticketId = "";

  try {

    let raw =
      ticketInput.value.trim();

    /* 🔐 CPASS FORMAT */

    if (
      raw.startsWith("CPASS|")
    ) {

      raw =
        atob(
          raw.replace(
            "CPASS|",
            ""
          )
        );

    }

    ticketData =
      JSON.parse(raw);

    ticketId =
      ticketData.id;

    /* 🔐 HASH VALIDATION */

    if (ticketData.hash) {

      const expected =
        btoa(
          ticketData.id +
          ticketData.name +
          "cosmic_secret"
        );

      if (
        expected !==
        ticketData.hash
      ) {

        triggerAlert();

        updateStatus(
          "error",
          "⚠️ Ticket alterado",
          "Firma inválida"
        );

        addLog(
          `⚠️ Ticket alterado: ${ticketData.id}`
        );

        return;

      }

    }

  } catch {

    ticketId =
      ticketInput.value
        .trim();

  }

  ticketId =
    ticketId.trim();

  /* ❌ EMPTY */

  if (!ticketId) {

    updateStatus(
      "warning",
      "Ingresa un ticket",
      "Escanea o pega manualmente el ID"
    );

    return;

  }

  /* 🔍 QUERY SUPABASE */

  const {
    data: ticket,
    error
  } = await supabaseClient

    .from("qr_valida_tickets")

    .select("*")

    .eq("id", ticketId)

    .single();

  console.log(
    "TICKET:",
    ticket
  );

  console.log(
    "ERROR:",
    error
  );

  console.log(
    "BUSCANDO:",
    ticketId
  );

  /* ❌ INVALID */

  if (!ticket) {

    invalidCount++;

    document
      .getElementById("invalidCount")
      .innerText =
        invalidCount;

    triggerAlert();

    updateStatus(
      "error",
      "❌ Ticket no válido",
      "El ticket no existe"
    );

    addLog(
      `❌ Ticket inválido: ${ticketId}`
    );

    ticketInput.value = "";

    return;

  }

  /* 🚨 DUPLICATE */

  if (ticket.used) {

    /* 🚨 DISCORD ALERT */

    fetch(
      "TU_DISCORD_WEBHOOK",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            username:
              "COSMIC SECURITY",

            content:

`🚨 ALERTA — COSMIC PASS SECURITY

Se detectó un intento de reutilización de ticket previamente validado.

━━━━━━━━━━━━━━━━━━

🎫 Ticket:
${ticket.id}

👤 Nombre:
${ticket.name}

🕒 Hora:
${new Date().toLocaleTimeString()}

📍 Escáner:
Entrada Principal

👮 Operador:
${currentUser.username}

━━━━━━━━━━━━━━━━━━

⚠️ Acceso bloqueado automáticamente.

🔎 Posibles causas:
• QR compartido
• Captura reutilizada
• Reventa fraudulenta
• Acceso simultáneo

🛰️ Evento registrado en Cosmic Pass Security.`

          })

      }

    );

    dupCount++;

    document
      .getElementById("dupCount")
      .innerText =
        dupCount;

    triggerAlert();

    updateStatus(
      "error",
      "🚨 Ticket ya utilizado",
      `${ticket.name} | Primer acceso: ${ticket.used_at}`
    );

    addLog(
      `🚨 Duplicado detectado: ${ticket.id}`
    );

    ticketInput.value = "";

    return;

  }

  /* ✅ MARK USED */

  ticket.used = true;

  ticket.used_at =
    new Date()
      .toLocaleTimeString();

  await supabaseClient

    .from("qr_valida_tickets")

    .update({

      used: true,

      used_at:
        ticket.used_at

    })

    .eq("id", ticket.id);

  /* ✅ SUCCESS */

  const displayName =
    ticketData?.name ||
    ticket.name;

  const displayType =
    ticketData?.type ||
    ticket.type;

  okCount++;

  document
    .getElementById("okCount")
    .innerText =
      okCount;

  updateStatus(
    "success",
    "✅ Acceso permitido",
    `${displayName} | ${displayType}`
  );

  addLog(
    `✅ ${currentUser.username} autorizó ${ticket.id} (${displayName})`
  );

  ticketInput.value = "";

}

/* ========================= */
/* STATUS */
/* ========================= */

function updateStatus(
  type,
  message,
  meta
) {

  statusBox.className =
    `status ${type}`;

  statusBox.innerHTML = `

    ${message}

    <div class="meta">
      ${meta}
    </div>

  `;

}

/* ========================= */
/* LOGS */
/* ========================= */

function addLog(text) {

  const logs =
    document
      .getElementById(
        "logsContainer"
      );

  const item =
    document.createElement(
      "div"
    );

  item.className =
    "log-item";

  item.innerText =
    `${new Date().toLocaleTimeString()} - ${text}`;

  logs.prepend(item);

}

/* ========================= */
/* ALERT */
/* ========================= */

function triggerAlert() {

  document.body.classList.add(
    "alert-mode"
  );

  alertSound.currentTime = 0;

  alertSound
    .play()
    .catch(err => {

      console.log(
        "Audio bloqueado:",
        err
      );

    });

  setTimeout(() => {

    document.body.classList.remove(
      "alert-mode"
    );

  }, 2000);

}

/* ========================= */
/* CAMERA QR */
/* ========================= */

function startScanner() {

  const scanner =
    new Html5Qrcode(
      "reader"
    );

  scanner.start(

    {
      facingMode:
        "environment"
    },

    {
      fps: 10,
      qrbox: 250
    },

    decodedText => {

      const now =
        Date.now();

      /* 🚫 BLOCK REPEATED */

      if (

        decodedText ===
          lastScan &&

        now -
          lastScanTime <
          3000

      ) {

        return;

      }

      lastScan =
        decodedText;

      lastScanTime =
        now;

      ticketInput.value =
        decodedText;

      validateTicket();

    }

  )

  .then(() => {

    console.log(
      "📷 Cámara iniciada"
    );

    addLog(
      "📷 Cámara activa"
    );

  })

  .catch(err => {

    console.error(
      "❌ Error cámara:",
      err
    );

    addLog(
      "❌ Cámara bloqueada"
    );

    updateStatus(
      "warning",
      "⚠️ Cámara no disponible",
      "Permite acceso a la cámara"
    );

  });

}

/* ========================= */
/* BUTTON */
/* ========================= */

validateBtn
  .addEventListener(
    "click",
    validateTicket
  );

/* ========================= */
/* INIT */
/* ========================= */

addLog(
  "🟢 Sistema iniciado"
);