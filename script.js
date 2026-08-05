const SUPABASE_URL = "https://uqrbykxgsarsfyyvmibr.supabase.co";
const SUPABASE_KEY = "sb_publishable_8K6sVOFwsLbVOUGUr6a-5A_ldVlLQxu";
const supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  ); 

const rolesPermitidos = [
    "owner",
    "admin",
    "scanner"
];

if (

    !rolesPermitidos.includes(

        String(
            currentUser.rol
        ).toLowerCase()

    )

){

alert("No tienes permisos para acceder al Scanner.");

window.location.href="https://cosmic-pass.vercel.app/";

    throw new Error(
        "Sin permisos."
    );

}
let offlineTickets =

  JSON.parse(

    localStorage.getItem(
      "offlineTickets"
    ) || "[]"

  );

let pendingSync =

  JSON.parse(

    localStorage.getItem(
      "pendingSync"
    ) || "[]"

  );

const ticketInput =
  document.getElementById(
    "ticketInput"
  );

const validateBtn =
  document.getElementById(
    "validateBtn"
  );

const statusBox =
  document.getElementById(
    "statusBox"
  );

/* ========================= */
/* COUNTERS */
/* ========================= */

let okCount = 0;
let dupCount = 0;
let invalidCount = 0;

/* ========================= */
/* ANTISPAM SCAN */
/* ========================= */

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
/* SYNC OFFLINE TICKETS */
/* ========================= */

async function syncOfflineTickets() {

    if (!navigator.onLine) {

        addLog("📦 MODO OFFLINE");
        updateConnectionStatus();
        return;

    }

    try {

        const { data, error } = await supabaseClient
            .from("qr_valida_tickets")
            .select("*");

        if (error) {
            console.error(error);
            return;
        }

        offlineTickets = data;

        localStorage.setItem(
            "offlineTickets",
            JSON.stringify(data)
        );

        addLog(`☁️ ${data.length} tickets sincronizados`);

        updateConnectionStatus();

    } catch (err) {

        console.error(err);

    }
  }

/* ========================= */
/* SYNC PENDING */
/* ========================= */

async function syncPendingTickets(){

  /*
    Si no hay internet:
    no sincronizar.
  */

  if(!navigator.onLine){

    return;

  }

  /*
    Nada pendiente.
  */

  if(!pendingSync.length){

    return;

  }

  addLog(
    "☁️ Sincronizando pendientes..."
  );

  for(const item of pendingSync){

    try{

      await supabaseClient

        .from(
          "qr_valida_tickets"
        )

        .update({

          used: item.used,

          used_at: item.used_at

        })

        .eq(
          "id",
          item.id
        );

    }catch(err){

      console.error(err);

    }

  }

  pendingSync = [];

  localStorage.setItem(

    "pendingSync",

    JSON.stringify([])

  );

  addLog(
    "✅ Pendientes sincronizados"
  );

}

/* ========================= */
/* ONLINE EVENT */
/* ========================= */

window.addEventListener(

  "online",

  async () => {

    addLog(
      "🟢 Internet restaurado"
    );

    updateConnectionStatus();

    await syncOfflineTickets();

    await syncPendingTickets();

  }

);

/* ========================= */
/* OFFLINE EVENT */
/* ========================= */

window.addEventListener(

  "offline",

  () => {

    addLog(
      "🟠 Modo offline activado"
    );

    updateConnectionStatus();

  }

);
window.addEventListener("load", async () => {

    document.getElementById("staffDisplay").innerText =
        currentUser.nombre;

    document.getElementById("roleDisplay").innerText =
        currentUser.rol;

    document.getElementById("productoraDisplay").innerText =
        currentUser.productora_nombre || "-";

    const operador = document.getElementById("operadorPanel");
    if (operador) {
        operador.innerText = currentUser.nombre;
    }

    const productora = document.getElementById("productoraPanel");
    if (productora) {
        productora.innerText = currentUser.productora_nombre || "-";
    }

    updateConnectionStatus();

    addLog(`🔐 ${currentUser.nombre}`);

    await syncOfflineTickets();

    await syncPendingTickets();

    startScanner();

});
/* ========================= */
/* CONNECTION STATUS */
/* ========================= */

function updateConnectionStatus() {

    const connection = document.getElementById("connectionStatus");
    const estado = document.getElementById("estadoPanel");

    const text = navigator.onLine
        ? "🟢 Online"
        : "🟠 Offline";

    if (connection) {
        connection.innerText = text;
    }

    if (estado) {
        estado.innerText = text;
    }

}

/* ========================= */
/* VALIDATE */
/* ========================= */

async function validateTicket() {

  /* ========================= */
  /* LOGIN CHECK */
  /* ========================= */

  if (!currentUser) {

    triggerAlert();

    updateStatus(

      "warning",

      "ACCESO RESTRINGIDO",

      "Debes iniciar sesión",

      "LOGIN REQUIRED"

    );

    return;

  }

  let ticketData = null;

  let ticketId = "";

  /* ========================= */
  /* QR PARSE */
  /* ========================= */

  try {

    let raw =
      ticketInput.value.trim();

    /*
      QR firmado.
    */

    if (
      raw.startsWith(
        "CPASS|"
      )
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

    /* ========================= */
    /* HASH VALIDATION */
    /* ========================= */

    if (
      ticketData.hash
    ) {

      const expected =

        btoa(

          ticketData.id +

          ticketData.name +

          "cosmic_secret"

        );

      /*
        Ticket alterado.
      */

      if (
        expected !==
        ticketData.hash
      ) {

        triggerAlert();

        updateStatus(

          "error",

          "⚠️ Ticket alterado",

          "Firma inválida",

          "TAMPER DETECTED"

        );

        addLog(

          `⚠️ Ticket alterado: ${ticketData.id}`

        );

        return;

      }

    }

  } catch {

    /*
      Manual input.
    */

    ticketId =
      ticketInput.value
        .trim();

  }

  ticketId =
    ticketId.trim();

  /* EMPTY */

  if (!ticketId) {

    updateStatus(

      "warning",

      "Ingresa un ticket",

      "Escanea o pega manualmente el ID",

      "EMPTY INPUT"

    );

    return;

  }

  /* ========================= */
  /* QUERY MODE */
  /* ========================= */

  let ticket = null;

  /*
    ONLINE
  */

  if(navigator.onLine){

    try{

      const {

        data,

        error

      } = await supabaseClient

        .from(
          "qr_valida_tickets"
        )

        .select("*")

        .eq("id", ticketId)
        .eq("id_productora", currentUser.id_productora)
        .single();

      ticket = data;

      console.log(
        "🟢 ONLINE MODE"
      );

    }catch(err){

      console.error(err);

    }

  }else{

    /*
      OFFLINE CACHE
    */

    ticket =

      offlineTickets.find(

        t => t.id === ticketId

      );

    console.log(
      "🟠 OFFLINE MODE"
    );

    addLog(
      "📦 Validación offline"
    );

  }

  /* ========================= */
  /* INVALID */
  /* ========================= */

  if (!ticket) {

    invalidCount++;

    document

      .getElementById(
        "invalidCount"
      )

      .innerText =
        invalidCount;

    triggerAlert();

    updateStatus(

      "error",

      "ACCESO DENEGADO",

      "El ticket no existe",

      "INVALID TICKET"

    );

    addLog(
      `❌ Ticket inválido: ${ticketId}`
    );

    ticketInput.value = "";

    return;

  }

  /* ========================= */
  /* DUPLICATE */
  /* ========================= */

  if (ticket.used) {

    /*
      Discord alert solo online.
    */

    if(navigator.onLine){

      try {

        await fetch(

          "https://discord.com/api/webhooks/1502078247813386351/bSLQr9Jv4jq_75z-GAMWid6JQipvOfl2jUqPcwS16dppw7uzzjp79R0sVWqermpZVNKV",

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

`🚨 ALERTA DUPLICADO

🎫 ${ticket.id}
👤 ${ticket.name}
👮 ${currentUser.nombre}`

              })

          }

        );

      } catch(err) {

        console.error(err);

      }

    }

    dupCount++;

    document

      .getElementById(
        "dupCount"
      )

      .innerText =
        dupCount;

    triggerAlert();

    updateStatus(

      "error",

      "TICKET DUPLICADO",

      `${ticket.name}`,

      `PRIMER ACCESO ${ticket.used_at}`

    );

    addLog(
      `🚨 Duplicado: ${ticket.id}`
    );

    ticketInput.value = "";

    return;

  }

  ticket.used = true;
  ticket.used_at =

    new Date().toLocaleTimeString();

  const localIndex = offlineTickets.findIndex(
      t => t.id === ticket.id
    );

  if(localIndex !== -1){
    offlineTickets[localIndex] = ticket;
    localStorage.setItem(
      "offlineTickets",
      JSON.stringify(
        offlineTickets
      )

    );

  }

  /* ========================= */
  /* ONLINE SAVE */
  /* ========================= */

  if(navigator.onLine){

    try{

await supabaseClient
    .from("qr_valida_tickets")
    .update({
        used: true,
        used_at: ticket.used_at
    })
    .eq("id", ticket.id)
    .eq("id_productora", currentUser.id_productora);

    }catch(err){

      console.error(err);

    }

  }else{

    /*
      Guardar pendiente.
    */

    pendingSync.push({

      id: ticket.id,

      used: true,

      used_at:
        ticket.used_at

    });

    localStorage.setItem(

      "pendingSync",

      JSON.stringify(
        pendingSync
      )

    );

    addLog(
      "📡 Pendiente de sincronización"
    );

  }

  /* ========================= */
  /* SUCCESS */
  /* ========================= */

  const displayName =

    ticketData?.name ||

    ticket.name;

  const displayType =

    ticketData?.type ||

    ticket.type;

  okCount++;

  document

    .getElementById(
      "okCount"
    )

    .innerText =
      okCount;

  updateStatus(

    "success",

    "ACCESO AUTORIZADO",

    displayName,

    displayType

  );

  addLog(`✅ ${currentUser.nombre} autorizó ${ticket.id} (${displayName})`);

  ticketInput.value = "";

}

/* ========================= */
/* STATUS */
/* ========================= */

function updateStatus(
  type,
  title,
  subtitle,
  meta
) {

  statusBox.className =
    `status ${type}`;

  let icon = "◎";

  if (type === "success") {
    icon = "✓";
  }

  if (type === "error") {
    icon = "✕";
  }

  if (type === "warning") {
    icon = "⚠";
  }

  /* RESET FX */

  document.body.classList.remove(

    "scan-success",
    "scan-duplicate",
    "scan-invalid"

  );

  /* SUCCESS */

  if (type === "success") {

    document.body.classList.add(
      "scan-success"
    );

    setTimeout(() => {

      document.body.classList.remove(
        "scan-success"
      );

    }, 600);

  }

  /* DUPLICATE */

  if (

    type === "error" &&

    title.includes("DUPLICADO")

  ) {

    document.body.classList.add(
      "scan-duplicate"
    );

    setTimeout(() => {

      document.body.classList.remove(
        "scan-duplicate"
      );

    }, 2000);

  }

  /* INVALID */

  if (

    type === "error" &&

    title.includes("DENEGADO")

  ) {

    document.body.classList.add(
      "scan-invalid"
    );

    setTimeout(() => {

      document.body.classList.remove(
        "scan-invalid"
      );

    }, 1600);

  }

  /* RENDER */

  statusBox.innerHTML = `

    <div class="status-icon">
      ${icon}
    </div>

    <div class="status-content">

      <div class="status-title">
        ${title}
      </div>

      <div class="status-subtitle">
        ${subtitle}
      </div>

      <div class="status-meta">
        ${meta}
      </div>

    </div>

  `;

}

/* ========================= */
/* LOGS */
/* ========================= */

function addLog(text) {

  const logs =

    document.getElementById(
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

      /*
        Anti doble lectura.
      */

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

      "CÁMARA NO DISPONIBLE",

      "Permite acceso a la cámara",

      "CAMERA ACCESS REQUIRED"

    );
  });
}

validateBtn

  .addEventListener(

    "click",

    validateTicket

  );

addLog(
  "🟢 Sistema iniciado"
);

updateConnectionStatus()