(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const eur = n => Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hm = iso => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const byOld = (a, b) => a.created_at > b.created_at ? 1 : -1;

  // Mensaje para avisar al cliente por WhatsApp (se abre ya escrito; solo hay que darle a enviar).
  const AVISO = {
    nuevo: "hemos recibido tu pedido",
    cocina: "tu pedido ya está en cocina",
    reparto: "tu pedido ya va de camino",
    listo: "tu pedido ya está listo para recoger en el local",
    entregado: "gracias por tu pedido, ¡que aproveche!",
  };

  const state = {
    orders: [], month: null, tab: "actuales", sel: new Set(), rider: null,
    riders: JSON.parse(localStorage.getItem("chicotin-repartidores") || "[]"),
  };
  let known = null, soundOn = false, audioCtx = null;

  $("#fecha").textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  /* ── Arranque y sesión ─────────────────── */
  async function start() {
    if (DB.mode === "local") {
      $("#mode-tag").hidden = $("#demo-order").hidden = $("#demo-month").hidden = false;
      return showPanel();
    }
    (await DB.session()) ? showPanel() : showLogin();
  }
  function showLogin() { $("#login").hidden = false; $("#view").hidden = $("#tabs").hidden = true; }
  async function showPanel() {
    $("#login").hidden = true; $("#view").hidden = $("#tabs").hidden = false;
    $("#logout").hidden = DB.mode === "local";
    await load();
    DB.subscribe(() => load());
    setInterval(load, 30000);
    setInterval(renderAges, 20000);
  }
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await DB.signIn(f.get("email"), f.get("password"));
    if (error) { $("#login-err").textContent = "Correo o contraseña incorrectos."; $("#login-err").hidden = false; return; }
    showPanel();
  });
  $("#logout").onclick = async () => { await DB.signOut(); location.reload(); };

  /* ── Datos ──────────────────────────────── */
  async function load() {
    try { state.orders = await DB.listOrders(18); }
    catch (e) { console.error(e); return; }
    if (state.tab === "caja") state.month = null;   // se recalcula al pintar
    const fresh = known ? state.orders.filter(o => !known.has(o.id) && o.status === "nuevo") : [];
    known = new Set(state.orders.map(o => o.id));
    render(new Set(fresh.map(o => o.id)));
    if (fresh.length) alertNew(fresh);
  }

  async function update(ids, patch) {
    if (!ids.length) return;
    state.orders.forEach(o => { if (ids.includes(o.id)) Object.assign(o, patch, { updated_at: new Date().toISOString() }); });
    state.sel.clear(); state.month = null;
    render();
    try { await DB.updateOrders(ids, patch); }
    catch (e) { console.error(e); flash("No se pudo guardar el cambio. Revisa la conexión."); load(); }
  }

  const list = st => state.orders.filter(o => st.includes(o.status)).sort(byOld);

  /* ── Pintar ─────────────────────────────── */
  function render(newIds = new Set()) {
    const counts = { actuales: list(["nuevo"]).length, cocina: list(["cocina"]).length, reparto: list(["reparto", "listo"]).length };
    document.querySelectorAll("[data-count]").forEach(b => b.textContent = counts[b.dataset.count] || "");
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === state.tab));
    document.title = (counts.actuales ? `(${counts.actuales}) ` : "") + "Panel de pedidos · Chicotín";

    // La selección solo vale para pedidos que siguen en la pestaña actual.
    const visible = new Set((state.tab === "actuales" ? list(["nuevo"]) : state.tab === "cocina" ? list(["cocina"]) : []).map(o => o.id));
    [...state.sel].forEach(id => { if (!visible.has(id)) state.sel.delete(id); });

    const v = $("#view");
    const y = v.scrollTop;
    if (state.tab === "actuales") v.innerHTML = viewActuales(newIds);
    if (state.tab === "cocina") v.innerHTML = viewCocina();
    if (state.tab === "reparto") v.innerHTML = viewReparto();
    if (state.tab === "caja") { v.innerHTML = `<div class="empty"><b>Calculando…</b></div>`; renderCaja(); }
    v.scrollTop = y;
    renderAges();
    renderActionbar();
  }

  function card(o, { isNew, selectable = true, acts = "" } = {}) {
    const tel = String(o.telefono).replace(/\D/g, "");
    const maps = o.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.direccion + ", Piedras Blancas")}` : "";
    const detail = d => esc(d).replace(/(Sin [^·]+)/g, '<span class="sin">$1</span>');
    return `
      <article class="order ${isNew ? "is-new" : ""} ${state.sel.has(o.id) ? "is-sel" : ""}" data-id="${o.id}" ${selectable ? 'data-sel="1"' : ""}>
        ${selectable ? `<span class="check" aria-hidden="true">✓</span>` : ""}
        <div class="order__top"><span class="order__num">#${esc(o.num)}</span><span class="age" data-at="${o.created_at}" data-status="${o.status}"></span></div>
        <div class="chips">
          <span class="chip ${o.modo === "domicilio" ? "chip--dom" : "chip--rec"}">${o.modo === "domicilio" ? "🛵 Domicilio" : "🥡 Recoger"}</span>
          <span class="chip">🕒 ${esc(o.hora)}</span>
          <span class="chip">${o.pago === "Tarjeta" ? "💳" : "💶"} ${esc(o.pago)}</span>
          ${o.encargo ? `<span class="chip chip--enc">Encargo ${esc(o.encargo.split("-").reverse().join("/"))}</span>` : ""}
        </div>
        <ul class="items">${(o.items || []).map(i => `<li><b>${i.qty}×</b> ${esc(i.n)}${i.d ? `<small>${detail(i.d)}</small>` : ""}</li>`).join("")}</ul>
        ${o.notas ? `<div class="notes">📝 ${esc(o.notas)}</div>` : ""}
        <div class="who"><span><a href="tel:${tel}">${esc(o.nombre)} · ${esc(o.telefono)}</a>
          ${o.direccion ? `<br><a href="${maps}" target="_blank" rel="noopener">📍 ${esc(o.direccion)}</a>` : ""}</span>
          <span class="total">${eur(o.total)}</span></div>
        <div class="order__acts"><button class="mini mini--wa" data-act="wa">💬 Avisar</button>${acts}</div>
      </article>`;
  }

  function head(title, sub, selectAll) {
    return `<div class="view__head"><div><h1>${title}</h1><p>${sub}</p></div>
      ${selectAll ? `<button class="selall" data-act="selall">${state.sel.size && state.sel.size === selectAll ? "Quitar selección" : "Seleccionar todos"}</button>` : ""}</div>`;
  }

  function viewActuales(newIds) {
    const l = list(["nuevo"]);
    return head("Pedidos actuales", "Toca un pedido para seleccionarlo y mándalo a cocina.", l.length) +
      (l.length ? `<div class="grid">${l.map(o => card(o, { isNew: newIds.has(o.id), acts: `<button class="mini mini--go" data-act="one" data-to="cocina">A cocina →</button>` })).join("")}</div>`
        : `<div class="empty"><b>Sin pedidos nuevos</b>Cuando entre uno, sonará y aparecerá aquí.</div>`);
  }

  function viewCocina() {
    const l = list(["cocina"]);
    return head("En cocina", "Selecciona uno o varios, elige repartidor y mándalos a reparto.", l.length) +
      (l.length ? `<div class="grid">${l.map(o => card(o, {
        acts: o.modo === "recoger" ? `<button class="mini mini--go" data-act="one" data-to="listo">Listo para recoger</button>` : "",
      })).join("")}</div>` : `<div class="empty"><b>Cocina vacía</b>Los pedidos que mandes desde "Pedidos actuales" aparecen aquí.</div>`);
  }

  function viewReparto() {
    const rep = list(["reparto"]), listos = list(["listo"]);
    const groups = {};
    rep.forEach(o => (groups[o.repartidor || "Sin asignar"] ||= []).push(o));
    let html = head("En reparto", "Cuando vuelva el repartidor, márcalo como entregado.", 0);
    if (!rep.length && !listos.length) return html + `<div class="empty"><b>Nadie en la calle</b>Los pedidos que salgan de cocina aparecen aquí, agrupados por repartidor.</div>`;
    html += `<div class="routes">${Object.entries(groups).map(([name, os]) => {
      const cash = os.filter(o => o.pago !== "Tarjeta").reduce((s, o) => s + Number(o.total), 0);
      const total = os.reduce((s, o) => s + Number(o.total), 0);
      const since = os.reduce((m, o) => o.updated_at < m ? o.updated_at : m, os[0].updated_at);
      return `<section class="route">
        <div class="route__head"><span class="route__av">🛵</span><div><h2>${esc(name)}</h2><p>Salió a las ${hm(since)} · ${os.length} ${os.length === 1 ? "pedido" : "pedidos"}</p></div></div>
        <div class="route__sum"><div><small>Total que lleva</small><b>${eur(total)}</b></div><div><small>Cobrar en efectivo</small><b>${eur(cash)}</b></div></div>
        <ol class="stops">${os.map(o => `
          <li class="stop" data-id="${o.id}">
            <div class="stop__l1"><span>#${esc(o.num)} · ${esc(o.nombre)}</span><span>${eur(o.total)} ${o.pago === "Tarjeta" ? "💳" : "💶"}</span></div>
            <div class="stop__l2"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((o.direccion || "") + ", Piedras Blancas")}" target="_blank" rel="noopener">📍 ${esc(o.direccion || "")}</a> · <a href="tel:${String(o.telefono).replace(/\D/g, "")}">${esc(o.telefono)}</a></div>
            <div class="stop__acts"><button class="mini" data-act="stop-ok">✓ Entregado</button><button class="mini" data-act="stop-back">↩ A cocina</button><button class="mini mini--wa" data-act="wa">💬 Avisar</button></div>
          </li>`).join("")}
        </ol>
        <button class="back-btn" data-act="rider-back" data-rider="${esc(name)}">✓ ${esc(name)} ha vuelto · todo entregado</button>
      </section>`;
    }).join("")}</div>`;
    if (listos.length) {
      html += `<h2 class="section-t">Para recoger en el local (${listos.length})</h2>
        <div class="grid">${listos.map(o => card(o, { selectable: false, acts: `<button class="mini mini--go" data-act="one" data-to="entregado">✓ Recogido</button>` })).join("")}</div>`;
    }
    return html;
  }

  function renderAges() {
    document.querySelectorAll(".age").forEach(el => {
      const min = Math.floor((Date.now() - new Date(el.dataset.at)) / 60000);
      el.textContent = `${hm(el.dataset.at)} · ${min < 1 ? "ahora" : `hace ${min} min`}`;
      el.classList.toggle("is-late", (el.dataset.status === "nuevo" && min >= 5) || (el.dataset.status === "cocina" && min >= 30));
    });
  }

  /* ── Barra de acciones ──────────────────── */
  function renderActionbar() {
    const bar = $("#actionbar");
    const sel = state.orders.filter(o => state.sel.has(o.id));
    if (!sel.length || !["actuales", "cocina"].includes(state.tab)) { bar.hidden = true; return; }
    const n = `<span class="actionbar__n">${sel.length} ${sel.length === 1 ? "seleccionado" : "seleccionados"}</span>`;
    if (state.tab === "actuales") {
      bar.innerHTML = `${n}<span class="actionbar__sp"></span>
        <button class="abtn" data-bar="cancel">Cancelar</button>
        <button class="abtn abtn--red" data-bar="to-cocina">Mandar a cocina →</button>`;
    } else {
      const dom = sel.filter(o => o.modo === "domicilio"), rec = sel.filter(o => o.modo === "recoger");
      bar.innerHTML = `
        ${dom.length ? `<div class="riders"><span>Repartidor:</span>
          ${state.riders.map(r => `<button class="rider" data-rider="${esc(r)}" aria-pressed="${state.rider === r}">${esc(r)}</button>`).join("")}
          <form class="rider-add" data-bar="add-rider"><input name="r" placeholder="Nuevo repartidor" maxlength="30" aria-label="Nombre del nuevo repartidor"><button class="rider" type="submit">+ Añadir</button></form>
        </div>` : ""}
        ${n}<span class="actionbar__sp"></span>
        <button class="abtn" data-bar="cancel">Cancelar</button>
        <button class="abtn" data-bar="to-actuales">↩ Devolver</button>
        ${dom.length ? `<button class="abtn abtn--red" data-bar="to-reparto" ${state.rider ? "" : "disabled"}>${state.rider ? `Mandar con ${esc(state.rider)} →` : "Elige repartidor"}${rec.length ? ` (+${rec.length} a recoger)` : ""}</button>`
          : `<button class="abtn abtn--green" data-bar="to-listo">Listo para recoger →</button>`}`;
    }
    bar.hidden = false;
  }

  $("#actionbar").addEventListener("click", e => {
    const r = e.target.closest(".rider[data-rider]");
    if (r) { state.rider = state.rider === r.dataset.rider ? null : r.dataset.rider; renderActionbar(); return; }
    const b = e.target.closest("[data-bar]"); if (!b || b.tagName === "FORM") return;
    const ids = [...state.sel];
    const sel = state.orders.filter(o => state.sel.has(o.id));
    if (b.dataset.bar === "to-cocina") update(ids, { status: "cocina" });
    if (b.dataset.bar === "to-actuales") update(ids, { status: "nuevo", repartidor: null });
    if (b.dataset.bar === "to-listo") update(ids, { status: "listo" });
    // Confirmación con doble toque (los avisos del navegador están bloqueados en algunas tablets).
    if (b.dataset.bar === "cancel") {
      if (b.dataset.armed) { update(ids, { status: "cancelado" }); flash(`${ids.length === 1 ? "Pedido cancelado" : `${ids.length} pedidos cancelados`}`); }
      else {
        b.dataset.armed = "1"; b.classList.add("abtn--red");
        b.textContent = `¿Seguro? Toca otra vez para cancelar ${ids.length === 1 ? "el pedido" : `los ${ids.length}`}`;
        setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.classList.remove("abtn--red"); b.textContent = "Cancelar"; } }, 4000);
      }
      return;
    }
    if (b.dataset.bar === "to-reparto" && state.rider) {
      const rec = sel.filter(o => o.modo === "recoger").map(o => o.id);
      const dom = sel.filter(o => o.modo === "domicilio").map(o => o.id);
      const who = state.rider;
      update(dom, { status: "reparto", repartidor: who });
      if (rec.length) DB.updateOrders(rec, { status: "listo" }).then(load);
      flash(`${dom.length} ${dom.length === 1 ? "pedido sale" : "pedidos salen"} con ${who}`);
    }
  });
  $("#actionbar").addEventListener("submit", e => {
    e.preventDefault();
    const name = e.target.r.value.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!name) return;
    if (!state.riders.includes(name)) state.riders.push(name);
    localStorage.setItem("chicotin-repartidores", JSON.stringify(state.riders));
    state.rider = name; renderActionbar();
  });

  /* ── Clics en la vista ──────────────────── */
  $("#view").addEventListener("click", e => {
    const a = e.target.closest("[data-act]");
    const art = e.target.closest(".order, .stop");
    const o = art && state.orders.find(x => x.id === art.dataset.id);
    if (a) {
      const act = a.dataset.act;
      if (act === "selall") {
        const ids = (state.tab === "actuales" ? list(["nuevo"]) : list(["cocina"])).map(x => x.id);
        state.sel.size === ids.length ? state.sel.clear() : ids.forEach(id => state.sel.add(id));
        return render();
      }
      if (act === "one") return update([o.id], { status: a.dataset.to });
      if (act === "stop-ok") return update([o.id], { status: "entregado" });
      if (act === "stop-back") return update([o.id], { status: "cocina", repartidor: null });
      if (act === "rider-back") {
        const ids = list(["reparto"]).filter(x => (x.repartidor || "Sin asignar") === a.dataset.rider).map(x => x.id);
        update(ids, { status: "entregado" });
        return flash(`${a.dataset.rider}: ${ids.length} ${ids.length === 1 ? "pedido entregado" : "pedidos entregados"}`);
      }
      if (act === "wa") return avisar(o);
      return;
    }
    if (e.target.closest("a")) return;                     // teléfono / mapa
    const card = e.target.closest(".order[data-sel]");
    if (card) {
      state.sel.has(card.dataset.id) ? state.sel.delete(card.dataset.id) : state.sel.add(card.dataset.id);
      card.classList.toggle("is-sel");
      const sa = $(".selall"); if (sa) sa.textContent = state.sel.size && state.sel.size === document.querySelectorAll(".order[data-sel]").length ? "Quitar selección" : "Seleccionar todos";
      renderActionbar();
    }
  });

  function avisar(o) {
    const track = new URL(`seguimiento.html?id=${o.id}`, location.href).href;
    const text = `¡Hola ${o.nombre.split(" ")[0]}! Desde Chicotín: ${AVISO[o.status] || "te escribimos por tu pedido"} (pedido #${o.num}).\nPuedes seguirlo aquí: ${track}`;
    let tel = String(o.telefono).replace(/\D/g, "");
    if (tel.length === 9) tel = "34" + tel;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    state.tab = b.dataset.tab; state.sel.clear(); state.month = null;
    $("#view").scrollTop = 0;
    render();
  });

  /* ── Caja ───────────────────────────────── */
  async function renderCaja() {
    try { state.month ||= await DB.listOrders(31 * 24); }
    catch (e) { console.error(e); $("#view").innerHTML = `<div class="empty"><b>No se pudo cargar la caja</b>Revisa la conexión.</div>`; return; }
    if (state.tab !== "caja") return;
    const all = state.month.filter(o => o.status !== "cancelado");
    const done = all.filter(o => o.status === "entregado");
    const today = dayKey(new Date());
    const sum = os => os.reduce((s, o) => s + Number(o.total), 0);
    const cash = os => sum(os.filter(o => o.pago !== "Tarjeta"));
    const card = os => sum(os.filter(o => o.pago === "Tarjeta"));

    const tDone = done.filter(o => dayKey(o.created_at) === today);
    const tOpen = all.filter(o => o.status !== "entregado" && dayKey(o.created_at) === today);
    const riders = {};
    tDone.filter(o => o.modo === "domicilio").forEach(o => (riders[o.repartidor || "Sin asignar"] ||= []).push(o));
    const local = tDone.filter(o => o.modo === "recoger");

    // Últimos 30 días (incluido hoy)
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
      const k = dayKey(d), os = done.filter(o => dayKey(o.created_at) === k);
      days.push({ k, d, n: os.length, total: sum(os), cash: cash(os), card: card(os) });
    }
    const open = days.filter(d => d.n > 0);
    const mTotal = sum(open.map(d => ({ total: d.total })));
    const mOrders = open.reduce((s, d) => s + d.n, 0);
    const avgDay = open.length ? mTotal / open.length : 0;
    const avgOrders = open.length ? mOrders / open.length : 0;
    const best = open.reduce((b, d) => !b || d.total > b.total ? d : b, null);
    const fmtDay = d => d.d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

    $("#view").innerHTML = `
      ${head("Caja", "Solo cuentan los pedidos entregados. Los cancelados no suman.", 0)}
      <div class="tiles">
        <div class="tile tile--hero"><small>Facturado hoy</small><b>${eur(sum(tDone))}</b><span>${tDone.length} ${tDone.length === 1 ? "pedido entregado" : "pedidos entregados"}</span></div>
        <div class="tile"><small>Ticket medio hoy</small><b>${eur(tDone.length ? sum(tDone) / tDone.length : 0)}</b><span>por pedido</span></div>
        <div class="tile"><small>Aún en curso</small><b>${eur(sum(tOpen))}</b><span>${tOpen.length} sin entregar todavía</span></div>
      </div>
      <div class="split">
        <div class="box"><h3>Cobrado hoy</h3>
          <div class="kv"><span>💶 Efectivo</span><b>${eur(cash(tDone))}</b></div>
          <div class="kv"><span>💳 Tarjeta</span><b>${eur(card(tDone))}</b></div>
          <div class="kv"><span>Total</span><b>${eur(sum(tDone))}</b></div>
        </div>
        <div class="box"><h3>Efectivo que debe entregar cada repartidor</h3>
          ${Object.keys(riders).length ? Object.entries(riders).map(([r, os]) => `<div class="kv"><span>🛵 ${esc(r)} · ${os.length} ${os.length === 1 ? "pedido" : "pedidos"}</span><b>${eur(cash(os))}</b></div>`).join("") : `<div class="kv"><span>Aún no hay repartos entregados hoy</span><b>—</b></div>`}
          ${local.length ? `<div class="kv"><span>🥡 Recogidos en local · ${local.length}</span><b>${eur(cash(local))}</b></div>` : ""}
        </div>
      </div>
      <h2 class="section-t">Últimos 30 días</h2>
      <div class="tiles">
        <div class="tile"><small>Media facturada por día</small><b>${eur(avgDay)}</b><span>en ${open.length} ${open.length === 1 ? "día" : "días"} con ventas</span></div>
        <div class="tile"><small>Media de pedidos por día</small><b>${avgOrders.toFixed(1).replace(".", ",")}</b><span>pedidos</span></div>
        <div class="tile"><small>Total del periodo</small><b>${eur(mTotal)}</b><span>${mOrders} pedidos</span></div>
        <div class="tile"><small>Mejor día</small><b>${best ? eur(best.total) : "—"}</b><span>${best ? fmtDay(best) : ""}</span></div>
      </div>
      ${chart(days, avgDay)}
      <div class="box"><h3>Saldo de cada día</h3>
        <table class="days"><thead><tr><th>Día</th><th>Pedidos</th><th>Efectivo</th><th>Tarjeta</th><th>Total</th></tr></thead>
        <tbody>${days.slice().reverse().filter(d => d.n || d.k === today).map(d => `<tr class="${d.k === today ? "is-today" : ""}">
          <td>${d.k === today ? "Hoy" : fmtDay(d)}</td><td>${d.n}</td><td>${eur(d.cash)}</td><td>${eur(d.card)}</td><td class="tot">${eur(d.total)}</td></tr>`).join("")}</tbody></table>
      </div>`;
    wireChart(days);
  }

  // Barras de facturación diaria: una serie, un color, línea de media y tooltip al pasar/tocar.
  function chart(days, avg) {
    const W = 600, H = 200, padL = 44, padB = 22, padT = 8;
    const max = Math.max(avg, ...days.map(d => d.total), 1);
    const step = max > 1500 ? 500 : max > 600 ? 200 : max > 300 ? 100 : 50;
    const top = Math.ceil(max / step) * step;
    const y = v => padT + (H - padT - padB) * (1 - v / top);
    const bw = (W - padL) / days.length, w = Math.max(4, bw - 4);
    let g = "";
    for (let v = 0; v <= top; v += step) g += `<line class="grid-l" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}€</text>`;
    const bars = days.map((d, i) => {
      const x = padL + i * bw + (bw - w) / 2, h = Math.max(0, y(0) - y(d.total));
      const r = Math.min(4, w / 2, h);
      const path = d.total ? `M${x},${y(0)} V${y(d.total) + r} Q${x},${y(d.total)} ${x + r},${y(d.total)} H${x + w - r} Q${x + w},${y(d.total)} ${x + w},${y(d.total) + r} V${y(0)} Z`
        : `M${x},${y(0) - 2} h${w} v2 h${-w} Z`;
      const lbl = (i % 5 === 4 || i === days.length - 1) ? `<text class="ax" x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${d.d.getDate()}/${d.d.getMonth() + 1}</text>` : "";
      return `<rect class="hit" data-i="${i}" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}"/><path class="bar ${d.total ? "" : "is-zero"}" data-i="${i}" d="${path}"/>${lbl}`;
    }).join("");
    const avgLine = avg ? `<line class="avg-l" x1="${padL}" x2="${W}" y1="${y(avg)}" y2="${y(avg)}"/><text class="ax" x="${W}" y="${y(avg) - 5}" text-anchor="end" style="fill:var(--ink);font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:4px">media ${eur(avg)}</text>` : "";
    return `<div class="chart" id="chart"><h3>Facturado por día</h3><p>Pedidos entregados · últimos 30 días · pasa el dedo por una barra para ver el detalle</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Facturación diaria de los últimos 30 días">${g}${bars}${avgLine}</svg>
      <div class="tip" id="tip"></div></div>`;
  }
  function wireChart(days) {
    const c = $("#chart"); if (!c) return;
    const tip = $("#tip", c);
    const show = e => {
      const hit = e.target.closest(".hit"); if (!hit) return;
      const d = days[+hit.dataset.i];
      c.querySelectorAll(".bar").forEach(b => b.classList.toggle("is-hover", b.dataset.i === hit.dataset.i));
      const r = hit.getBoundingClientRect(), cr = c.getBoundingClientRect();
      tip.innerHTML = `${d.d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}<br><b>${eur(d.total)}</b> · ${d.n} ${d.n === 1 ? "pedido" : "pedidos"}`;
      tip.style.left = Math.min(Math.max(r.left - cr.left + r.width / 2, 90), cr.width - 90) + "px";
      tip.style.top = (r.top - cr.top + 30) + "px";
      tip.classList.add("is-on");
    };
    c.addEventListener("pointerover", show);
    c.addEventListener("pointerdown", show);
    c.addEventListener("pointerleave", () => { tip.classList.remove("is-on"); c.querySelectorAll(".bar").forEach(b => b.classList.remove("is-hover")); });
  }

  /* ── Avisos de pedido nuevo ─────────────── */
  function flash(t) { const f = $("#flash"); f.textContent = t; f.classList.add("is-on"); clearTimeout(flash.t); flash.t = setTimeout(() => f.classList.remove("is-on"), 3500); }
  function alertNew(l) {
    flash(l.length === 1 ? `Nuevo pedido #${l[0].num} · ${l[0].nombre}` : `${l.length} pedidos nuevos`);
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
  $("#sound").onclick = () => {
    soundOn = !soundOn;
    $("#sound").setAttribute("aria-pressed", soundOn);
    $("#sound").textContent = soundOn ? "🔔 Sonido activado" : "🔕 Activar sonido";
    if (soundOn) beep();
  };

  /* ── Datos de prueba (solo modo demo) ───── */
  const FAKE_ITEMS = [
    { qty: 1, n: "Hamburguesa Chicotín", d: "Sin pepinillo", total: 10.5 }, { qty: 2, n: "Hamburguesa Barbacoa", d: "+ Bacon", total: 22.4 },
    { qty: 1, n: "Menú del día", d: "Fabada asturiana · Cachopo de ternera · Patatas · Flan casero", total: 12 },
    { qty: 1, n: "Cachopo Chicotín", d: "", total: 18 }, { qty: 1, n: "Croquetas", d: "Jamón ibérico", total: 9 },
    { qty: 1, n: "Bocadillo Lomo", d: "Sin queso", total: 7 }, { qty: 2, n: "Refresco 1 litro", d: "Cola", total: 5.8 },
    { qty: 1, n: "Patatas Grandes con 5 Salsas", d: "", total: 7 }, { qty: 2, n: "Salsa Alioli", d: "", total: 0.6 },
  ];
  const NAMES = ["Marta", "Pedro", "Lucía", "Javi", "Ana", "Rubén", "Sara", "Iván", "Nerea", "Óscar"];
  const STREETS = ["Calle Ejemplo 1", "Avenida del Mar 12, 3ºB", "Calle La Fuente 4", "Plaza Mayor 2, 1ºA", "Camino Real 33"];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function fakeOrder(when, status) {
    const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => pick(FAKE_ITEMS));
    const modo = Math.random() < .7 ? "domicilio" : "recoger";
    const iso = when.toISOString();
    return {
      id: newId(), num: String(Math.floor(1000 + Math.random() * 9000)), modo, hora: "Hoy · lo antes posible",
      nombre: pick(NAMES), telefono: "600 000 000", direccion: modo === "domicilio" ? pick(STREETS) : null,
      items, total: +items.reduce((s, i) => s + i.total, 0).toFixed(2), pago: Math.random() < .65 ? "Efectivo" : "Tarjeta", notas: null,
      status, repartidor: status === "entregado" && modo === "domicilio" ? pick(["Dani", "Sergio"]) : null,
      created_at: iso, updated_at: iso,
    };
  }
  $("#demo-order").onclick = async () => {
    const o = fakeOrder(new Date(), "nuevo");
    delete o.created_at; delete o.updated_at; delete o.repartidor; delete o.status;
    await DB.createOrder(o);
    load();
  };
  $("#demo-month").onclick = async () => {
    const out = [];
    for (let i = 30; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (d.getDay() === 1) continue;                          // los lunes cierran
      const n = 14 + Math.floor(Math.random() * (d.getDay() === 0 || d.getDay() === 6 ? 26 : 14));
      for (let k = 0; k < n; k++) {
        const t = new Date(d); const lunch = Math.random() < .55;
        t.setHours(lunch ? 12 + Math.floor(Math.random() * 3) : 20 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
        out.push(fakeOrder(t, Math.random() < .03 ? "cancelado" : "entregado"));
      }
    }
    await DB.seed(out);
    state.month = null; flash(`${out.length} pedidos de prueba en los últimos 30 días`);
    state.tab = "caja"; render();
  };

  start();
})();
