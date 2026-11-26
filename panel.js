(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const eur = n => Number(n).toFixed(2).replace(".", ",") + " €";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hm = iso => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  // Paso siguiente según el estado y el tipo de pedido.
  const NEXT = {
    domicilio: { nuevo: ["cocina", "Pasar a cocina"], cocina: ["reparto", "Sale en reparto"], reparto: ["entregado", "Entregado"] },
    recoger: { nuevo: ["cocina", "Pasar a cocina"], cocina: ["listo", "Listo para recoger"], listo: ["entregado", "Recogido"] },
  };
  const PREV = { cocina: "nuevo", reparto: "cocina", listo: "cocina", entregado: null };
  const COL = { nuevo: "nuevo", cocina: "cocina", reparto: "salida", listo: "salida", entregado: "entregado" };
  // Mensaje para avisar al cliente por WhatsApp (semiautomático: se abre ya escrito).
  const AVISO = {
    nuevo: "hemos recibido tu pedido",
    cocina: "tu pedido ya está en cocina",
    reparto: "tu pedido ya va de camino",
    listo: "tu pedido ya está listo para recoger en el local",
    entregado: "gracias por tu pedido, ¡que aproveche!",
  };

  let orders = [], known = null, soundOn = false, audioCtx = null;

  /* ── Arranque y sesión ─────────────────── */
  const d = new Date();
  $("#fecha").textContent = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  async function start() {
    if (DB.mode === "local") {
      $("#mode-tag").hidden = $("#demo-order").hidden = false;
      return showBoard();
    }
    (await DB.session()) ? showBoard() : showLogin();
  }
  function showLogin() { $("#login").hidden = false; $("#board").hidden = true; $("#logout").hidden = true; }
  async function showBoard() {
    $("#login").hidden = true; $("#board").hidden = false;
    $("#logout").hidden = DB.mode === "local";
    await load();
    DB.subscribe(() => load());
    setInterval(load, 30000);           // por si se corta la conexión en tiempo real
    setInterval(renderAges, 20000);
  }
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await DB.signIn(f.get("email"), f.get("password"));
    if (error) { $("#login-err").textContent = "Correo o contraseña incorrectos."; $("#login-err").hidden = false; return; }
    showBoard();
  });
  $("#logout").onclick = async () => { await DB.signOut(); location.reload(); };

  /* ── Datos ──────────────────────────────── */
  async function load() {
    try { orders = await DB.listOrders(); }
    catch (e) { console.error(e); return; }
    const ids = new Set(orders.map(o => o.id));
    const fresh = known ? orders.filter(o => !known.has(o.id) && o.status === "nuevo") : [];
    known = ids;
    render(new Set(fresh.map(o => o.id)));
    if (fresh.length) alertNew(fresh);
  }

  async function move(id, status) {
    const o = orders.find(x => x.id === id); if (!o) return;
    o.status = status; o.updated_at = new Date().toISOString();
    render();
    try { await DB.updateStatus(id, status); }
    catch (e) { console.error(e); flash("No se pudo guardar el cambio. Revisa la conexión."); load(); }
  }

  /* ── Pintar ─────────────────────────────── */
  function card(o, isNew) {
    const next = NEXT[o.modo]?.[o.status];
    const prev = PREV[o.status];
    const tel = String(o.telefono).replace(/\D/g, "");
    const maps = o.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.direccion + ", Piedras Blancas")}` : "";
    return `
      <article class="order ${isNew ? "is-new" : ""}" data-id="${o.id}" data-status="${o.status}">
        <div class="order__top"><span class="order__num">#${esc(o.num)}</span><span class="age" data-at="${o.created_at}"></span></div>
        <div class="chips">
          <span class="chip ${o.modo === "domicilio" ? "chip--dom" : "chip--rec"}">${o.modo === "domicilio" ? "Domicilio" : "Recoger"}</span>
          <span class="chip">${esc(o.hora)}</span>
          <span class="chip">${esc(o.pago)}</span>
          ${o.encargo ? `<span class="chip chip--enc">Encargo ${esc(o.encargo.split("-").reverse().join("/"))}</span>` : ""}
        </div>
        <ul class="items">${(o.items || []).map(i => `<li><b>${i.qty}×</b> ${esc(i.n)}${i.d ? `<small>${esc(i.d)}</small>` : ""}</li>`).join("")}</ul>
        ${o.notas ? `<div class="notes">📝 ${esc(o.notas)}</div>` : ""}
        <p class="who"><a href="tel:${tel}">${esc(o.nombre)} · ${esc(o.telefono)}</a>
          ${o.direccion ? `<br><a href="${maps}" target="_blank" rel="noopener">📍 ${esc(o.direccion)}</a>` : ""}
          <br><span class="total">${eur(o.total)}</span></p>
        <div class="actions">
          ${prev ? `<button class="ico" data-act="back" title="Volver al paso anterior" aria-label="Volver al paso anterior">↩</button>` : ""}
          ${next ? `<button class="go" data-act="go" data-to="${next[0]}">${next[1]} →</button>` : `<span style="flex:1"></span>`}
          ${o.status !== "entregado" ? `<button class="ico" data-act="cancel" title="Cancelar pedido" aria-label="Cancelar pedido">✕</button>` : ""}
          <button class="ico ico--wa" data-act="wa" title="Avisar al cliente por WhatsApp" aria-label="Avisar al cliente por WhatsApp">💬</button>
        </div>
      </article>`;
  }

  function render(newIds = new Set()) {
    const groups = { nuevo: [], cocina: [], salida: [], entregado: [] };
    orders.filter(o => o.status !== "cancelado").forEach(o => groups[COL[o.status]]?.push(o));
    // Los activos, del más antiguo al más nuevo (se atienden en orden); los entregados, al revés.
    ["nuevo", "cocina", "salida"].forEach(k => groups[k].sort((a, b) => a.created_at > b.created_at ? 1 : -1));
    for (const [k, list] of Object.entries(groups)) {
      const col = $(`.col[data-col="${k}"]`);
      $(".count", col).textContent = list.length;
      $(".list", col).innerHTML = list.length ? list.map(o => card(o, newIds.has(o.id))).join("")
        : `<p class="empty">${k === "nuevo" ? "Sin pedidos nuevos" : "Nada por aquí"}</p>`;
    }
    const n = groups.nuevo.length;
    document.title = (n ? `(${n}) ` : "") + "Panel de pedidos · Chicotín";
    renderAges();
  }

  function renderAges() {
    document.querySelectorAll(".age").forEach(el => {
      const min = Math.floor((Date.now() - new Date(el.dataset.at)) / 60000);
      const status = el.closest(".order").dataset.status;
      el.textContent = `${hm(el.dataset.at)} · ${min < 1 ? "ahora" : `hace ${min} min`}`;
      el.classList.toggle("is-late", (status === "nuevo" && min >= 5) || (status === "cocina" && min >= 30));
    });
  }

  $("#board").addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest(".order").dataset.id, o = orders.find(x => x.id === id);
    if (b.dataset.act === "go") move(id, b.dataset.to);
    if (b.dataset.act === "back") move(id, PREV[o.status]);
    if (b.dataset.act === "cancel" && confirm(`¿Cancelar el pedido #${o.num} de ${o.nombre}?`)) move(id, "cancelado");
    if (b.dataset.act === "wa") {
      const track = new URL(`seguimiento.html?id=${o.id}`, location.href).href;
      const text = `¡Hola ${o.nombre.split(" ")[0]}! Desde Chicotín: ${AVISO[o.status] || "te escribimos por tu pedido"} (pedido #${o.num}).\nPuedes seguirlo aquí: ${track}`;
      let tel = String(o.telefono).replace(/\D/g, "");
      if (tel.length === 9) tel = "34" + tel;
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    }
  });

  /* ── Avisos de pedido nuevo ─────────────── */
  function flash(t) { const f = $("#flash"); f.textContent = t; f.classList.add("is-on"); setTimeout(() => f.classList.remove("is-on"), 3500); }
  function alertNew(list) {
    flash(list.length === 1 ? `Nuevo pedido #${list[0].num} · ${list[0].nombre}` : `${list.length} pedidos nuevos`);
    if (soundOn) beep();
    navigator.vibrate?.([200, 100, 200]);
  }
  function beep() {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [0, 0.22, 0.44].forEach((dt, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = [880, 1175, 1568][i];
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.4, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
      o.connect(g).connect(audioCtx.destination); o.start(t + dt); o.stop(t + dt + 0.22);
    });
  }
  // El navegador solo deja sonar si alguien ha tocado la pantalla antes.
  $("#sound").onclick = () => {
    soundOn = !soundOn;
    $("#sound").setAttribute("aria-pressed", soundOn);
    $("#sound").textContent = soundOn ? "🔔 Sonido activado" : "🔕 Activar sonido";
    if (soundOn) beep();
  };

  /* ── Pedido de prueba (solo modo demo) ──── */
  const FAKE = [
    ["Marta", "Domicilio", [{ qty: 2, n: "Hamburguesa Chicotín", d: "+ Bacon", total: 23 }, { qty: 1, n: "Refresco 1 litro", d: "Cola", total: 2.9 }]],
    ["Pedro", "Recoger", [{ qty: 1, n: "Menú del día", d: "Fabada asturiana · Cachopo de ternera · Patatas · Flan casero", total: 12 }]],
    ["Lucía", "Domicilio", [{ qty: 1, n: "Cachopo Chicotín", d: "", total: 18 }, { qty: 1, n: "Croquetas", d: "Jamón ibérico", total: 9 }]],
  ];
  $("#demo-order").onclick = async () => {
    const [nombre, modo, items] = FAKE[Math.floor(Math.random() * FAKE.length)];
    await DB.createOrder({
      id: newId(), num: String(Math.floor(1000 + Math.random() * 9000)), modo: modo === "Domicilio" ? "domicilio" : "recoger",
      hora: "Hoy · lo antes posible", nombre, telefono: "600 000 000", direccion: modo === "Domicilio" ? "Calle Ejemplo 1" : null,
      items, total: items.reduce((s, i) => s + i.total, 0), pago: ["Efectivo", "Tarjeta", "Bizum"][Math.floor(Math.random() * 3)], notas: null,
    });
    load();
  };

  start();
})();
