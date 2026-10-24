const SUPABASE_URL = "https://uqrbykxgsarsfyyvmibr.supabase.co";
const SUPABASE_KEY = "sb_publishable_8K6sVOFwsLbVOUGUr6a-5A_ldVlLQxu";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const API =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://www.cosmicpass.space";

let currentUser = null;
let scanner = null;
let isValidating = false;
let dupCount = 0;
let invalidCount = 0;
let lastScan = "";
let lastScanTime = 0;
/*
let offlineTickets = readLocalArray("offlineTickets");
let pendingSync = readLocalArray("pendingSync");
*/
let offlineTickets = [];

const ticketInput = document.getElementById("ticketInput");
const validateBtn = document.getElementById("validateBtn");
const statusBox = document.getElementById("statusBox");
const logoutBtn = document.getElementById("logoutBtn");

const alertSound = new Audio(
  "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
);
alertSound.preload = "auto";
alertSound.volume = 1.0;

/*
function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`No se pudo leer ${key}:`, error);
    return [];
  }
}
  */


function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function sameValue(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function ticketIsUsed(ticket) {
  const value = ticket?.used;

  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true"
  );
}

function currentEventTickets() {
  if (!Array.isArray(offlineTickets)) return [];
  if (!currentUser) return offlineTickets;

  return offlineTickets.filter(
    ticket =>
      sameValue(ticket.id_evento, currentUser.id_evento) &&
      sameValue(ticket.id_productora, currentUser.id_productora)
  );
}

function updateTicketStats() {
  const tickets = currentEventTickets();
  const totalCount = tickets.length;
  const usedCount = tickets.filter(ticketIsUsed).length;
  const availableCount = totalCount - usedCount;

  setText("totalCount", totalCount);
  setText("syncCount", totalCount);
  setText("availableCount", availableCount);
  setText("usedCount", usedCount);
  setText("okCount", usedCount);
  setText("dupCount", dupCount);
  setText("invalidCount", invalidCount);

  const lastSync = document.getElementById("lastSync");
  if (lastSync) {
    lastSync.textContent =
      `Última sincronización: ${new Date().toLocaleTimeString()}`;
  }
}

/*
function saveOfflineTickets() {
  localStorage.setItem(
    "offlineTickets",
    JSON.stringify(offlineTickets)
  );
}

function savePendingSync() {
  localStorage.setItem(
    "pendingSync",
    JSON.stringify(pendingSync)
  );
}

*/
function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
  );
}

async function syncOfflineTickets() {
  if (!currentUser) return;

  if (!navigator.onLine) {
    addLog("📦 Modo offline");
    updateConnectionStatus();
    updateTicketStats();
    return;
  }

  try {
    if (!hasValue(currentUser.id_productora)) {
      throw new Error("El usuario no tiene id_productora");
    }

    let query = supabaseClient
      .from("qr_valida_tickets")
      .select("*")
      .eq("id_productora", currentUser.id_productora);

    /*
     * Solo filtra por evento cuando realmente existe.
     * Evita enviar id_evento=eq.null.
     */
    if (hasValue(currentUser.id_evento)) {
      query = query.eq(
        "id_evento",
        currentUser.id_evento
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    offlineTickets = Array.isArray(data)
      ? data
      : [];

    /*
     * Si el usuario no trae evento, intenta detectarlo
     * automáticamente cuando todos los tickets pertenecen
     * a un solo evento.
     */
    if (!hasValue(currentUser.id_evento)) {
      const eventos = [
        ...new Set(
          offlineTickets
            .map(ticket => ticket.id_evento)
            .filter(hasValue)
            .map(String)
        )
      ];

      if (eventos.length === 1) {
        currentUser.id_evento = eventos[0];

        localStorage.setItem(
          "scanner_user",
          JSON.stringify(currentUser)
        );

        addLog(
          `🎫 Evento detectado: ${currentUser.id_evento}`
        );
      } else if (eventos.length > 1) {
        throw new Error(
          "La productora tiene varios eventos y la sesión no indica cuál utilizar"
        );
      }
    }

    saveOfflineTickets();
    updateTicketStats();
    updateConnectionStatus();

    addLog(
      `☁️ ${offlineTickets.length} tickets sincronizados`
    );
  } catch (error) {
    console.error(
      "Error al sincronizar tickets:",
      error
    );

    addLog(
      `❌ ${error.message || "Error al sincronizar tickets"}`
    );

    updateTicketStats();
  }
}

/*
async function syncPendingTickets() {
  if (!currentUser || !navigator.onLine || pendingSync.length === 0) {
    return;
  }

  addLog("☁️ Sincronizando accesos pendientes...");

  const failed = [];

  for (const item of pendingSync) {
    try {
      const { error } = await supabaseClient
        .from("qr_valida_tickets")
        .update({
          used: true,
          used_at: item.used_at
        })
        .eq("id", item.id)
        .eq("id_evento", item.id_evento)
        .eq("id_productora", item.id_productora);

      if (error) throw error;
    } catch (error) {
      console.error("Error sincronizando ticket pendiente:", error);
      failed.push(item);
    }
  }

  pendingSync = failed;
  savePendingSync();

  if (failed.length === 0) {
    addLog("✅ Pendientes sincronizados");
  } else {
    addLog(`⚠️ ${failed.length} pendientes sin sincronizar`);
  }
}
  */



async function validarSesion() {
  const usuarioGuardado = localStorage.getItem("scanner_user");

  if (usuarioGuardado) {
    try {
      currentUser = JSON.parse(usuarioGuardado);
      return Boolean(currentUser);
    } catch (error) {
      console.error("Sesión local inválida:", error);
      localStorage.removeItem("scanner_user");
    }
  }

  const token = new URLSearchParams(location.search).get("token");

  if (!token) {
    alert("Acceso no autorizado");
    location.href = "https://www.cosmicpass.space";
    return false;
  }

  try {
    const response = await fetch(
      `${API}/scanner/validate?token=${encodeURIComponent(token)}`
    );

    const data = await response.json();

    if (!response.ok || !data.success || !data.user) {
      throw new Error(data.message || "Sesión inválida");
    }

    currentUser = data.user;
    localStorage.setItem(
      "scanner_user",
      JSON.stringify(currentUser)
    );

    return true;
  } catch (error) {
    console.error("Error validando sesión:", error);
    alert("No fue posible validar la sesión.");
    return false;
  }
}

function renderUserData() {
  setText("staffDisplay", currentUser?.nombre || "-");
  setText("roleDisplay", currentUser?.rol || "-");
  setText(
    "productoraDisplay",
    currentUser?.productora_nombre || "-"
  );
  setText("operadorPanel", currentUser?.nombre || "-");
  setText(
    "productoraPanel",
    currentUser?.productora_nombre || "-"
  );
  setText(
    "eventDisplay",
    currentUser?.evento_nombre ||
      currentUser?.nombre_evento ||
      currentUser?.evento ||
      "Evento seleccionado"
  );
}

function updateConnectionStatus() {
  const text = navigator.onLine
    ? "🟢 Online"
    : "🟠 Offline";

  setText("connectionStatus", text);
  setText("estadoPanel", text);
}

function decodeTicketInput(rawValue) {
  let raw = rawValue.trim();
  let ticketData = null;
  let ticketId = "";

  try {
    if (raw.startsWith("CPASS|")) {
      raw = atob(raw.slice(6));
    }

    ticketData = JSON.parse(raw);
    ticketId = String(ticketData?.id || "").trim();

    if (ticketData?.hash) {
      const expected = btoa(
        String(ticketData.id) +
        String(ticketData.name || "") +
        "cosmic_secret"
      );

      if (expected !== ticketData.hash) {
        return {
          altered: true,
          ticketData,
          ticketId
        };
      }
    }
  } catch {
    ticketId = rawValue.trim();
  }

  return {
    altered: false,
    ticketData,
    ticketId
  };
}
/*
async function getTicket(ticketId) {
  if (navigator.onLine) {
    const { data, error } = await supabaseClient
      .from("qr_valida_tickets")
      .select("*")
      .eq("id", ticketId)
      .eq("id_evento", currentUser.id_evento)
      .eq("id_productora", currentUser.id_productora)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  addLog("📦 Validación offline");

  return offlineTickets.find(
    ticket =>
      sameValue(ticket.id, ticketId) &&
      sameValue(ticket.id_evento, currentUser.id_evento) &&
      sameValue(ticket.id_productora, currentUser.id_productora)
  ) || null;
}
  */

/*
async function getTicket(ticketId) {
  if (!navigator.onLine) {
    throw new Error("SIN INTERNET: no se puede validar el acceso");
  }

  const { data, error } = await supabaseClient
    .from("qr_valida_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("id_evento", currentUser.id_evento)
    .eq("id_productora", currentUser.id_productora)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
*/

async function getTicket(ticketId) {
  if (!navigator.onLine) {
    throw new Error("SIN INTERNET: no se puede validar el acceso");
  }

  const idEvento = currentUser?.id_evento;
  const idProductora = currentUser?.id_productora;

  if (
    idEvento == null ||
    idProductora == null ||
    String(idEvento).trim() === "" ||
    String(idEvento).trim() === "null" ||
    String(idProductora).trim() === "" ||
    String(idProductora).trim() === "null" ||
    !/^\d+$/.test(String(idEvento)) ||
    !/^\d+$/.test(String(idProductora))
  ) {
    throw new Error(
      `Sesión incompleta: id_evento=${idEvento}, id_productora=${idProductora}`
    );
  }

  const { data, error } = await supabaseClient
    .from("qr_valida_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("id_evento", Number(idEvento))
    .eq("id_productora", Number(idProductora))
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/*
function upsertLocalTicket(ticket) {
  const index = offlineTickets.findIndex(
    localTicket =>
      sameValue(localTicket.id, ticket.id) &&
      sameValue(localTicket.id_evento, ticket.id_evento) &&
      sameValue(localTicket.id_productora, ticket.id_productora)
  );

  if (index >= 0) {
    offlineTickets[index] = ticket;
  } else {
    offlineTickets.push(ticket);
  }

  saveOfflineTickets();
  updateTicketStats();
}
  */

function upsertLocalTicket(ticket) {
  const index = offlineTickets.findIndex(
    localTicket =>
      sameValue(localTicket.id, ticket.id) &&
      sameValue(localTicket.id_evento, ticket.id_evento) &&
      sameValue(localTicket.id_productora, ticket.id_productora)
  );

  if (index >= 0) {
    offlineTickets[index] = ticket;
  } else {
    offlineTickets.push(ticket);
  }

  updateTicketStats();
}

/*
async function markTicketAsUsed(ticket) {
  const usedAt = new Date().toISOString();

  if (!navigator.onLine) {
    const updatedTicket = {
      ...ticket,
      used: true,
      used_at: usedAt
    };

    upsertLocalTicket(updatedTicket);

    pendingSync.push({
      id: ticket.id,
      id_evento: currentUser.id_evento,
      id_productora: currentUser.id_productora,
      used_at: usedAt
    });

    savePendingSync();
    addLog("📡 Acceso pendiente de sincronización");
    return updatedTicket;
  }

  const { data, error } = await supabaseClient
    .from("qr_valida_tickets")
    .update({
      used: true,
      used_at: usedAt
    })
    .eq("id", ticket.id)
    .eq("id_evento", currentUser.id_evento)
    .eq("id_productora", currentUser.id_productora)
    .or("used.eq.false,used.is.null")
    .select("*")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const refreshed = await getTicket(ticket.id);
    return {
      duplicate: true,
      ticket: refreshed || ticket
    };
  }

  upsertLocalTicket(data);
  return data;
}
  */


async function markTicketAsUsed(ticket) {
  if (!navigator.onLine) {
    throw new Error("SIN INTERNET: acceso no autorizado");
  }

  const usedAt = new Date().toISOString();

  const { data, error } = await supabaseClient
    .from("qr_valida_tickets")
    .update({
      used: true,
      used_at: usedAt
    })
    .eq("id", ticket.id)
    .eq("id_evento", currentUser.id_evento)
    .eq("id_productora", currentUser.id_productora)
    .or("used.eq.false,used.is.null")
    .select("*")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const refreshed = await getTicket(ticket.id);
    return {
      duplicate: true,
      ticket: refreshed || ticket
    };
  }

  upsertLocalTicket(data);
  return data;
}


async function validateTicket() {
  if (isValidating) return;

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

  const rawInput = ticketInput?.value || "";
  const decoded = decodeTicketInput(rawInput);

  if (decoded.altered) {
    triggerAlert();
    updateStatus(
      "error",
      "TICKET ALTERADO",
      "Firma inválida",
      "TAMPER DETECTED"
    );
    addLog(`⚠️ Ticket alterado: ${decoded.ticketId}`);
    clearTicketInput();
    return;
  }

  const ticketId = decoded.ticketId.trim();

  if (!ticketId) {
    updateStatus(
      "warning",
      "INGRESA UN TICKET",
      "Escanea o captura el folio",
      "EMPTY INPUT"
    );
    return;
  }

  isValidating = true;
  if (validateBtn) validateBtn.disabled = true;

try {
  const ticket = await getTicket(ticketId);

  if (!ticket) {
    invalidCount += 1;
    updateTicketStats();
    triggerAlert();

    await sendDiscordAlert({
      tipo: "INVALIDO",
      ticketId: ticketId,
      nombre: decoded.ticketData?.name,
      evento:
        currentUser?.evento_nombre ||
        currentUser?.nombre_evento ||
        currentUser?.evento,
      operador: currentUser?.nombre
    });

    updateStatus(
      "error",
      "ACCESO DENEGADO",
      "El ticket no existe",
      "INVALID TICKET"
    );

    addLog(`❌ Ticket inválido: ${ticketId}`);
    clearTicketInput();
    return;
  }

  if (ticketIsUsed(ticket)) {
      showDuplicate(ticket);
      return;
    }

    const result = await markTicketAsUsed(ticket);

    if (result?.duplicate) {
      showDuplicate(result.ticket);
      return;
    }

    const updatedTicket = result;
    const displayName =
      decoded.ticketData?.name ||
      updatedTicket.name ||
      "Invitado";
    const displayType =
      decoded.ticketData?.type ||
      updatedTicket.type ||
      "Ticket";

    updateTicketStats();
    updateTicketPreview(updatedTicket, displayName, displayType);
    updateStatus(
      "success",
      "ACCESO AUTORIZADO",
      displayName,
      displayType
    );
    addLog(
      `✅ ${currentUser.nombre} autorizó ${updatedTicket.id} (${displayName})`
    );
    clearTicketInput();
  } 
  catch (error) {
    console.error("Error validando ticket:", error);
    console.error("Detalles:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      id_evento: currentUser?.id_evento,
      id_productora: currentUser?.id_productora
    });

    triggerAlert();

    updateStatus(
      "error",
      "ERROR DE VALIDACIÓN",
      error?.message || "Error desconocido",
      error?.code || "REVISA CONSOLA"
    );

    addLog(
      `❌ ${error?.code || "ERROR"}: ${error?.message || "Error desconocido"}`
    );
   } finally {
    isValidating = false;
    if (validateBtn) validateBtn.disabled = false;
  }
}

function showDuplicate(ticket) {
  dupCount += 1;
  updateTicketStats();
  triggerAlert();

    sendDiscordAlert({
    tipo: "DUPLICADO",
    ticketId: ticket?.id,
    nombre: ticket?.name,
    evento:
      currentUser?.evento_nombre ||
      currentUser?.nombre_evento ||
      currentUser?.evento,
    operador: currentUser?.nombre
  });

  updateStatus(
    "error",
    "TICKET DUPLICADO",
    ticket?.name || "Ticket utilizado",
    ticket?.used_at
      ? `PRIMER ACCESO ${formatDateTime(ticket.used_at)}`
      : "TICKET ALREADY USED"
  );

  addLog(`🚨 Duplicado: ${ticket?.id || "sin folio"}`);
  clearTicketInput();
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function updateTicketPreview(ticket, name, type) {
  setText("ticketNombre", name || "-");
  setText("ticketTipo", type || "-");
  setText("ticketCodigo", ticket?.id || "-");
  setText("ticketHora", new Date().toLocaleTimeString());
}

function clearTicketInput() {
  if (!ticketInput) return;
  ticketInput.value = "";
  ticketInput.focus();
}

function updateStatus(type, title, subtitle, meta) {
  if (!statusBox) return;

  statusBox.className = `status ${type}`;

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠"
  };

  const icon = icons[type] || "◎";

  statusBox.replaceChildren();

  const iconElement = document.createElement("div");
  iconElement.className = "status-icon";
  iconElement.textContent = icon;

  const content = document.createElement("div");
  content.className = "status-content";

  const titleElement = document.createElement("div");
  titleElement.className = "status-title";
  titleElement.textContent = title || "";

  const subtitleElement = document.createElement("div");
  subtitleElement.className = "status-subtitle";
  subtitleElement.textContent = subtitle || "";

  const metaElement = document.createElement("div");
  metaElement.className = "status-meta";
  metaElement.textContent = meta || "";

  content.append(titleElement, subtitleElement, metaElement);
  statusBox.append(iconElement, content);

  document.body.classList.remove(
    "scan-success",
    "scan-duplicate",
    "scan-invalid"
  );

  if (type === "success") {
    document.body.classList.add("scan-success");
    setTimeout(
      () => document.body.classList.remove("scan-success"),
      600
    );
  } else if (title?.includes("DUPLICADO")) {
    document.body.classList.add("scan-duplicate");
    setTimeout(
      () => document.body.classList.remove("scan-duplicate"),
      2000
    );
  } else if (title?.includes("DENEGADO")) {
    document.body.classList.add("scan-invalid");
    setTimeout(
      () => document.body.classList.remove("scan-invalid"),
      1600
    );
  }
}

function addLog(text) {
  const logs = document.getElementById("logsContainer");
  if (!logs) return;

  const item = document.createElement("div");
  item.className = "log-item";
  item.textContent =
    `${new Date().toLocaleTimeString()} - ${text}`;

  logs.prepend(item);
}

function triggerAlert() {
  document.body.classList.add("alert-mode");

  try {
    alertSound.pause();
    alertSound.currentTime = 0;

    const playPromise = alertSound.play();

    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.warn("No se pudo reproducir la alerta:", error);
      });
    }
  } catch (error) {
    console.warn("Error reproduciendo alerta:", error);
  }

  setTimeout(() => {
    document.body.classList.remove("alert-mode");
  }, 2000);
}

async function sendDiscordAlert({
  tipo,
  ticketId,
  nombre,
  evento,
  operador
}) {
  const webhook = "https://discord.com/api/webhooks/1502078247813386351/bSLQr9Jv4jq_75z-GAMWid6JQipvOfl2jUqPcwS16dppw7uzzjp79R0sVWqermpZVNKV";

  try {
    await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "Cosmic Pass Security",
        embeds: [
          {
            title: tipo === "DUPLICADO"
              ? "🚨 TICKET DUPLICADO"
              : "⚠️ TICKET INVÁLIDO",

            description:
              tipo === "DUPLICADO"
                ? "Se intentó utilizar nuevamente un ticket."
                : "Se intentó validar un ticket inexistente.",

            fields: [
              {
                name: "🎫 Ticket",
                value: String(ticketId || "-"),
                inline: true
              },
              {
                name: "👤 Invitado",
                value: String(nombre || "-"),
                inline: true
              },
              {
                name: "🎪 Evento",
                value: String(evento || "-"),
                inline: true
              },
              {
                name: "👮 Operador",
                value: String(operador || "-"),
                inline: true
              }
            ],

            timestamp: new Date().toISOString()
          }
        ]
      })
    });
  } catch (error) {
    console.error("Error enviando alerta a Discord:", error);
  }
}

async function startScanner() {
  if (!document.getElementById("reader")) return;

  try {
    scanner = new Html5Qrcode("reader");

    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      decodedText => {
        const now = Date.now();

        if (
          decodedText === lastScan &&
          now - lastScanTime < 3000
        ) {
          return;
        }

        lastScan = decodedText;
        lastScanTime = now;

        if (ticketInput) {
          ticketInput.value = decodedText;
        }

        validateTicket();
      }
    );

    addLog("📷 Cámara activa");
  } catch (error) {
    console.error("Error de cámara:", error);
    addLog("❌ Cámara bloqueada");
    updateStatus(
      "warning",
      "CÁMARA NO DISPONIBLE",
      "Permite el acceso a la cámara",
      "CAMERA ACCESS REQUIRED"
    );
  }
}

async function logout() {
  try {
    if (scanner) {
      await scanner.stop();
    }
  } catch (error) {
    console.error("No se pudo detener la cámara:", error);
  }

  localStorage.removeItem("scanner_user");
  location.href = "https://www.cosmicpass.space";
}

/*
window.addEventListener("online", async () => {
  addLog("🟢 Internet restaurado");
  updateConnectionStatus();
  await syncPendingTickets();
  await syncOfflineTickets();
});
*/
window.addEventListener("online", () => {
  addLog("🟢 Internet restaurado");
  updateConnectionStatus();
});


window.addEventListener("offline", () => {
  addLog("🟠 Modo offline activado");
  updateConnectionStatus();
  updateTicketStats();
});

window.addEventListener("load", async () => {
  updateConnectionStatus();
  updateTicketStats();

  const validSession = await validarSesion();
  if (!validSession) return;

  renderUserData();
  addLog(`🔐 ${currentUser.nombre || "Operador"}`);

  //await syncPendingTickets();
  //await syncOfflineTickets();
  await startScanner();
});

validateBtn?.addEventListener("click", validateTicket);

ticketInput?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    validateTicket();
  }
});

logoutBtn?.addEventListener("click", logout);