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
/* DB */
/* ========================= */

let ticketsDB = [];

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

/* 🔊 ALERT SOUND */
const alertSound =
  new Audio(
    "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
  );
/* ========================= */
/* LOGIN */
/* ========================= */

document
.getElementById("loginBtn")
.addEventListener("click", login);

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
    users.find(u =>
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

  /* 🔓 OPEN SCANNER */

  document
  .getElementById("loginScreen")
  .style.display = "none";

  document
  .getElementById("scannerApp")
  .style.display = "grid";

  startScanner();

  /* 👮 STAFF */

  document
    .getElementById("staffDisplay")
    .innerText =
      `${user.username} (${user.role})`;

  /* 📝 LOG */

  addLog(
    `🔐 Login: ${user.username}`
  );

  /* 🚦 STATUS */

  updateStatus(
    "success",
    "✅ Sesión iniciada",
    `${user.role} | ${user.gate}`
  );

}

/* ========================= */
/* LOAD CSV */
/* ========================= */

async function loadCSV() {

  const res =
    await fetch("tickets.csv");

  const text =
    await res.text();

  const rows =
    text.split("\n").slice(1);

  ticketsDB = rows.map(row => {

    const [
      id,
      name,
      type,
      used,
      usedAt
    ] = row.split(",");

    return {

      id: id?.trim(),

      name: name?.trim(),

      type: type?.trim(),

      used: used === "true",

      usedAt: usedAt || null

    };

  }).filter(t => t.id);

  console.log(
    "📄 Tickets cargados:",
    ticketsDB
  );

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

  let ticketId;

  try {

    let raw =
      ticketInput.value.trim();

    /* 🔐 CPASS FORMAT */

    if (raw.startsWith("CPASS|")) {

      raw =
        atob(
          raw.replace("CPASS|", "")
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

      if (expected !== ticketData.hash) {

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
      ticketInput.value.trim();

  }

  /* ❌ EMPTY */

  if (!ticketId) {

    updateStatus(
      "warning",
      "Ingresa un ticket",
      "Escanea o pega manualmente el ID"
    );

    return;

  }

  /* 🔍 FIND */

  const ticket =
    ticketsDB.find(
      item => item.id === ticketId
    );

  /* ❌ INVALID */

  if (!ticket) {

    invalidCount++;

    document
      .getElementById("invalidCount")
      .innerText = invalidCount;

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
/* 🔄 REFRESH TICKET */

const {
  data: freshTicket
} = await supabaseClient

  .from("tickets")

  .select("*")

  .eq("id", ticketId)

  .single();
  /* 🚨 DUPLICATE */

if (freshTicket.used) {

  /* 🚨 DISCORD ALERT */

  fetch(
    "https://discord.com/api/webhooks/1502078247813386351/bSLQr9Jv4jq_75z-GAMWid6JQipvOfl2jUqPcwS16dppw7uzzjp79R0sVWqermpZVNKV",
    {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        username: "COSMIC SECURITY",

        content:
`🚨 ALERTA — COSMIC PASS SECURITY
Se detectó un intento de reutilización de ticket previamente validado.

━━━━━━━━━━━━━━━━━━

🎫 Ticket comprometido:
${ticket.id}

👤 Portador registrado:
${ticket.name}

🕒 Hora del incidente:
${new Date().toLocaleTimeString()}

📍 Escáner activo:
Entrada Principal

👮 Operador en sesión:
${currentUser.username}

━━━━━━━━━━━━━━━━━━

⚠️ El mismo código QR fue escaneado más de una vez y el acceso fue bloqueado automáticamente por el sistema.

🔎 Se recomienda verificar inmediatamente al portador para descartar:
• Captura compartida del QR
• Intento de acceso no autorizado
• Uso simultáneo del mismo ticket

🛰️ Evento registrado exitosamente en el sistema de monitoreo en tiempo real de Cosmic Pass Security.`

      })

    }

  );

  dupCount++;

  document
    .getElementById("dupCount")
    .innerText = dupCount;

  triggerAlert();

  updateStatus(
    "error",
    "🚨 Ticket ya utilizado",
    `${ticket.name} | Primer acceso:${freshTicket.used_at}`
  );

  addLog(
    `🚨 Duplicado detectado: ${ticket.id}`
  );

  ticketInput.value = "";

  return;

}

  /* ✅ MARK USED */

ticket.used = true;

ticket.usedAt =
  new Date().toLocaleTimeString();

await supabaseClient

  .from("tickets")

  .update({

    used: true,

    used_at:
      ticket.usedAt

  })

  .eq("id", ticket.id);

  const displayName =
    ticketData?.name || ticket.name;

  const displayType =
    ticketData?.type || ticket.type;

  okCount++;

  document
    .getElementById("okCount")
    .innerText = okCount;

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
    .getElementById("logsContainer");

  const item =
    document.createElement("div");

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

  /* 🔊 SOUND */

  alertSound.currentTime = 0;

  alertSound.play()
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

/* ========================= */
/* CAMERA QR */
/* ========================= */

function startScanner() {

  const scanner =
    new Html5Qrcode("reader");

  scanner.start(

    {
      facingMode: "environment"
    },

    {
      fps: 10,
      qrbox: 250
    },

    (decodedText) => {

      const now = Date.now();

      /* 🚫 BLOCK REPEATED */

      if (
        decodedText === lastScan &&
        now - lastScanTime < 3000
      ) {
        return;
      }

      lastScan = decodedText;
      lastScanTime = now;

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

async function loadTickets() {

  const {
    data,
    error
  } = await supabaseClient

    .from("tickets")

    .select("*");

  if (error) {

    console.error(
      "SUPABASE ERROR:",
      error
    );

    return;

  }

  ticketsDB = data;

  console.log(
    "🎫 Tickets cargados:",
    ticketsDB
  );

}


/*loadCSV();*/
loadTickets();
addLog(
  "🟢 Sistema iniciado"
);