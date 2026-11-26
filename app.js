(() => {
  const C = window.CONFIG, CARTA = window.CARTA, MDD = window.MENU_DIA, EXTRAS = window.EXTRAS;
  const $ = (s, el = document) => el.querySelector(s);
  const eur = n => n.toFixed(2).replace(".", ",") + " €";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  const state = {
    mode: "domicilio",
    cart: [],                // { key, n, d, unit, qty, encargo }
    mdd: { primero: null, segundo: null, acomp: MDD.acompanamientos[0], postre: MDD.postres[0] },
    form: JSON.parse(localStorage.getItem("chicotin-form") || "{}"),
  };

  /* ── Horario ─────────────────────────────── */
  const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const nowMin = d => d.getHours() * 60 + d.getMinutes();

  function isOpen(d = new Date()) {
    return (C.horario[d.getDay()] || []).some(([a, b]) => nowMin(d) >= toMin(a) && nowMin(d) < toMin(b));
  }
  function nextOpening(d = new Date()) {
    for (let i = 0; i < 8; i++) {
      const day = new Date(d); day.setDate(d.getDate() + i);
      for (const [a] of C.horario[day.getDay()] || []) {
        if (i > 0 || toMin(a) > nowMin(d)) return { day, i, hora: a };
      }
    }
  }
  // Sin horas programadas: el pedido se hace con el local abierto y sale lo antes posible.
  function closedText() {
    const n = nextOpening();
    if (!n) return "";
    const cuando = n.i === 0 ? "hoy" : n.i === 1 ? "mañana" : `el ${DIAS[n.day.getDay()]}`;
    return `Abrimos ${cuando} a las ${n.hora}; podrás pedir desde ese momento.`;
  }

  function renderStatus() {
    const el = $("#status"), open = isOpen();
    el.classList.toggle("is-open", open);
    if (open) {
      const t = C.horario[new Date().getDay()].find(([a, b]) => nowMin(new Date()) < toMin(b));
      $("b", el).textContent = `Abierto · hasta ${t[1]}`;
    } else {
      const n = nextOpening();
      $("b", el).textContent = n ? `Cerrado · abre ${n.i === 0 ? "a las" : n.i === 1 ? "mañana" : DIAS[n.day.getDay()]} ${n.hora}` : "Cerrado";
    }
  }

  /* ── Menú del día ────────────────────────── */
  function mddPrice(d = new Date()) { return [0, 6].includes(d.getDay()) ? MDD.precioFinde : MDD.precioSemana; }
  function renderMdd() {
    const d = new Date();
    $("#mdd-fecha").textContent = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
    $("#mdd-precio").textContent = mddPrice() + "€";
    const groups = [["primero", "Primero", MDD.primeros], ["segundo", "Segundo", MDD.segundos], ["acomp", "Acompañamiento", MDD.acompanamientos], ["postre", "Postre", MDD.postres]];
    $("#mdd-grid").innerHTML = groups.map(([k, t, list]) => `
      <div class="mdd__grp"><h3>${t}</h3><div class="chips">
        ${list.map(v => `<button class="chip ${state.mdd[k] === v ? "is-on" : ""}" data-k="${k}" data-v="${esc(v)}" aria-pressed="${state.mdd[k] === v}">${esc(v)}</button>`).join("")}
      </div></div>`).join("");
    const ready = state.mdd.primero && state.mdd.segundo;
    const b = $("#mdd-add");
    b.disabled = !ready;
    b.textContent = ready ? `Añadir menú · ${mddPrice()} €` : !state.mdd.primero ? "Elige el primero" : "Elige el segundo";
  }
  $("#mdd-grid").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    state.mdd[c.dataset.k] = c.dataset.v; renderMdd();
  });
  $("#mdd-add").addEventListener("click", e => {
    const m = state.mdd;
    addToCart({ n: "Menú del día", d: [m.primero, m.segundo, m.acomp, m.postre].join(" · "), unit: mddPrice(), qty: 1 }, e.currentTarget);
    state.mdd.primero = state.mdd.segundo = null; renderMdd();
  });

  /* ── Carta ──────────────────────────────── */
  const itemById = {};
  function renderCarta() {
    $("#cats").innerHTML = `<a href="#menu-dia" data-cat="menu-dia">Menú del día</a>` + CARTA.map(c => `<a href="#cat-${c.id}" data-cat="cat-${c.id}">${c.nombre}</a>`).join("");
    $("#carta").innerHTML = CARTA.map(c => `
      <section class="cat" id="cat-${c.id}">
        <h2 class="reveal">${c.nombre}</h2>
        ${c.nota ? `<p class="cat__note">${c.nota}</p>` : ""}
        <div class="items">
          ${c.platos.map((p, i) => {
            const id = `${c.id}-${i}`; itemById[id] = { ...p, cat: c.nombre };
            const price = p.variantes ? `desde ${eur(Math.min(...p.variantes.map(v => v[1])))}` : eur(p.p);
            return `<button class="item reveal" data-id="${id}">
              <div><div class="item__n">${esc(p.n)}${p.tag ? `<span class="tag">${p.tag}</span>` : ""}${p.encargo ? `<span class="tag">Encargo</span>` : ""}</div>
                ${p.d ? `<div class="item__d">${esc(p.d)}</div>` : ""}
                <div class="item__p">${price}</div></div>
              <span class="item__plus" aria-hidden="true">+</span>
            </button>`;
          }).join("")}
        </div>
      </section>`).join("");
  }
  $("#carta").addEventListener("click", e => {
    const b = e.target.closest(".item"); if (!b) return;
    const p = itemById[b.dataset.id];
    if (!p.variantes && !p.opciones && !p.extras && !ingredientes(p).length) addToCart({ n: itemName(p), d: "", unit: p.p, qty: 1, encargo: p.encargo, src: b.dataset.id }, b);
    else openOptions(b.dataset.id, b);
  });
  // Ingredientes que se pueden quitar: los de la descripción menos el principal (la carne, el pollo…).
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function ingredientes(p) {
    if (p.quitar) return p.quitar;
    if (!["Hamburguesas", "Bocadillos", "Sándwiches"].includes(p.cat)) return [];
    if (!p.d || /^(2 pisos|Con una|Solo|La Chicotín)/.test(p.d)) return [];
    return p.d.split(/,\s*|\s+y\s+/).map(s => s.trim()).filter(Boolean).slice(1);
  }
  const itemName = p => (p.cat === "Hamburguesas" ? "Hamburguesa " : p.cat === "Bocadillos" ? "Bocadillo " : p.cat === "Sándwiches" ? "Sándwich " : "") + p.n;

  function refreshBadges() {
    document.querySelectorAll(".item").forEach(b => {
      const q = state.cart.filter(l => l.src === b.dataset.id).reduce((s, l) => s + l.qty, 0);
      let badge = $(".item__qty", b);
      if (q && !badge) { badge = document.createElement("span"); badge.className = "item__qty"; b.prepend(badge); }
      if (badge) q ? (badge.textContent = q) : badge.remove();
    });
  }

  /* ── Hoja (modal) ────────────────────────── */
  let lastFocus = null;
  function openSheet(html) {
    lastFocus = document.activeElement;
    $("#sheet-body").innerHTML = html;
    $("#sheet").hidden = $("#scrim").hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => { $("#sheet").classList.add("is-on"); $("#scrim").classList.add("is-on"); });
    $("#sheet-body").scrollTop = 0;
    setTimeout(() => $("#sheet-x").focus({ preventScroll: true }), 50);
  }
  function closeSheet() {
    $("#sheet").classList.remove("is-on"); $("#scrim").classList.remove("is-on");
    document.body.style.overflow = "";
    setTimeout(() => { $("#sheet").hidden = $("#scrim").hidden = true; }, 400);
    lastFocus?.focus?.({ preventScroll: true });
  }
  $("#sheet-x").onclick = closeSheet;
  $("#scrim").onclick = closeSheet;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

  function openOptions(id, srcEl) {
    const p = itemById[id];
    const sinList = ingredientes(p);
    let qty = 1;
    const html = `
      <p class="eyebrow">${esc(p.cat)}</p>
      <h2>${esc(p.n)}</h2>
      ${p.d ? `<p class="sub">${esc(p.d)}</p>` : `<p class="sub"></p>`}
      ${p.variantes ? `<div class="opt-grp"><h3>Tamaño</h3>${p.variantes.map(([v, pr], i) => `
        <label class="opt"><input type="radio" name="var" value="${i}" ${i === 0 ? "checked" : ""}><span>${v}</span><small>${eur(pr)}</small></label>`).join("")}</div>` : ""}
      ${p.opciones ? `<div class="opt-grp"><h3>${p.opciones.titulo}</h3>${p.opciones.valores.map((v, i) => `
        <label class="opt"><input type="radio" name="op" value="${esc(v)}" ${i === 0 ? "checked" : ""}><span>${esc(v)}</span></label>`).join("")}</div>` : ""}
      ${sinList.length ? `<div class="opt-grp"><h3>Quitar ingredientes <small style="text-transform:none;letter-spacing:0;font-weight:400">· toca lo que no quieras</small></h3><div class="qchips">${sinList.map(v => `
        <label class="qchip"><input type="checkbox" name="sin" value="${esc(v)}"><span>${esc(cap(v))}</span></label>`).join("")}</div></div>` : ""}
      ${p.extras ? `<div class="opt-grp"><h3>Extras</h3>${EXTRAS[p.extras].map(([v, pr]) => `
        <label class="opt"><input type="checkbox" name="ex" value="${esc(v)}" data-p="${pr}"><span>${esc(v)}</span><small>+${eur(pr)}</small></label>`).join("")}</div>` : ""}
      <div class="addrow">
        <div class="qty"><button data-q="-1" aria-label="Quitar uno">−</button><b id="oq">1</b><button data-q="1" aria-label="Añadir uno">+</button></div>
        <button class="btn btn--red" id="oadd"></button>
      </div>`;
    openSheet(html);
    const body = $("#sheet-body");
    const calc = () => {
      let unit = p.variantes ? p.variantes[+body.querySelector("[name=var]:checked").value][1] : p.p;
      body.querySelectorAll("[name=ex]:checked").forEach(x => unit += +x.dataset.p);
      return unit;
    };
    const upd = () => { $("#oq").textContent = qty; $("#oadd").textContent = `Añadir · ${eur(calc() * qty)}`; };
    body.addEventListener("change", upd);
    body.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { qty = Math.max(1, qty + +b.dataset.q); upd(); });
    $("#oadd").onclick = () => {
      const bits = [];
      if (p.variantes) bits.push(p.variantes[+body.querySelector("[name=var]:checked").value][0]);
      if (p.opciones) bits.push(body.querySelector("[name=op]:checked").value);
      const sin = [...body.querySelectorAll("[name=sin]:checked")].map(x => "Sin " + x.value);
      const ex = [...body.querySelectorAll("[name=ex]:checked")].map(x => "+ " + x.value);
      addToCart({ n: itemName(p), d: [...bits, ...sin, ...ex].join(" · "), unit: calc(), qty, encargo: p.encargo, src: id }, srcEl);
      closeSheet();
    };
    upd();
  }

  /* ── Carrito ─────────────────────────────── */
  function addToCart(line, fromEl) {
    line.key = line.n + "|" + line.d;
    const ex = state.cart.find(l => l.key === line.key);
    ex ? (ex.qty += line.qty) : state.cart.push(line);
    fly(fromEl);
    renderCartbar(true);
    refreshBadges();
    toast(`Añadido: ${line.n}`);
  }
  const count = () => state.cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = () => state.cart.reduce((s, l) => s + l.unit * l.qty, 0);
  const envio = () => state.mode === "domicilio" ? C.gastosEnvio : 0;

  function renderCartbar(bump) {
    const bar = $("#cartbar");
    bar.hidden = !state.cart.length;
    $("#cart-n").textContent = count();
    $("#cart-total").textContent = eur(subtotal() + envio());
    if (bump) { bar.classList.remove("bump"); void bar.offsetWidth; bar.classList.add("bump"); }
  }
  $("#cartbar").onclick = () => openCart();

  // Salsas: se ofrecen al final, en el carrito, y se guardan como líneas normales del pedido.
  const SX = window.SALSAS_EXTRA || { precio: 0, lista: [] };
  const salsaLine = s => state.cart.find(l => l.salsa && l.n === "Salsa " + s);
  function sauces() {
    if (!SX.lista.length) return "";
    return `<div class="sauces"><h3>¿Unas salsas? <small>${eur(SX.precio)} cada una</small></h3>
      ${SX.lista.map(s => { const q = salsaLine(s)?.qty || 0; return `
        <div class="sauce ${q ? "is-on" : ""}"><span>${esc(s)}</span>
          <div class="qty">${q ? `<button data-salsa="${esc(s)}" data-q="-1" aria-label="Quitar ${esc(s)}">−</button><b>${q}</b>` : ""}<button data-salsa="${esc(s)}" data-q="1" aria-label="Añadir ${esc(s)}">+</button></div>
        </div>`; }).join("")}
    </div>`;
  }
  function cartLines() {
    return state.cart.map((l, i) => l.salsa ? "" : `
      <div class="line">
        <div class="line__n">${esc(l.n)}</div>
        <div class="line__p">${eur(l.unit * l.qty)}</div>
        ${l.d ? `<div class="line__d">${esc(l.d)}</div>` : ""}
        <div class="qty"><button data-i="${i}" data-q="-1" aria-label="Quitar uno">${l.qty === 1 ? "🗑" : "−"}</button><b>${l.qty}</b><button data-i="${i}" data-q="1" aria-label="Añadir uno">+</button></div>
      </div>`).join("");
  }
  function openCart() {
    const min = state.mode === "domicilio" && subtotal() < C.pedidoMinimoDomicilio;
    openSheet(`
      <p class="eyebrow">${state.mode === "domicilio" ? "A domicilio" : "Recoger en local"}</p>
      <h2>Tu pedido</h2>
      ${cartLines()}
      ${sauces()}
      ${min ? `<div class="warn">El pedido mínimo a domicilio es de ${eur(C.pedidoMinimoDomicilio)}. Te faltan ${eur(C.pedidoMinimoDomicilio - subtotal())}.</div>` : ""}
      <div class="sum">
        <div><span>Subtotal</span><span>${eur(subtotal())}</span></div>
        ${state.mode === "domicilio" ? `<div><span>Envío</span><span>${C.gastosEnvio ? eur(C.gastosEnvio) : "Gratis"}</span></div>` : ""}
        <div class="tot"><span>Total</span><span>${eur(subtotal() + envio())}</span></div>
      </div>
      <div class="addrow"><button class="btn btn--ghost" id="seguir">Seguir pidiendo</button><button class="btn btn--red" id="checkout" ${min ? "disabled" : ""}>Continuar</button></div>
    `);
    $("#sheet-body").querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
      const l = state.cart[+b.dataset.i]; l.qty += +b.dataset.q;
      if (l.qty <= 0) state.cart.splice(+b.dataset.i, 1);
      if (!state.cart.some(x => !x.salsa)) state.cart = [];   // sin platos, las salsas solas no tienen sentido
      renderCartbar(); refreshBadges();
      state.cart.length ? openCartRefresh() : closeSheet();
    });
    $("#sheet-body").querySelectorAll("[data-salsa]").forEach(b => b.onclick = () => {
      const s = b.dataset.salsa, l = salsaLine(s);
      if (l) { l.qty += +b.dataset.q; if (l.qty <= 0) state.cart.splice(state.cart.indexOf(l), 1); }
      else state.cart.push({ key: `Salsa ${s}|`, n: `Salsa ${s}`, d: "", unit: SX.precio, qty: 1, salsa: true });
      renderCartbar(); openCartRefresh();
    });
    $("#seguir").onclick = closeSheet;
    $("#checkout").onclick = openCheckout;
  }
  function openCartRefresh() { const y = $("#sheet-body").scrollTop; openCart(); $("#sheet-body").scrollTop = y; }

  /* ── Checkout ────────────────────────────── */
  function openCheckout() {
    const f = state.form, dom = state.mode === "domicilio";
    const open = isOpen();
    const hasEncargo = state.cart.some(l => l.encargo);
    const minDate = new Date(); minDate.setDate(minDate.getDate() + 2);
    openSheet(`
      <p class="eyebrow">Último paso</p>
      <h2>${dom ? "¿Dónde te lo llevamos?" : "¿Cuándo vienes?"}</h2>
      <p class="sub">${dom ? "Repartimos en Piedras Blancas y alrededores." : C.direccion}</p>
      <form id="cf" novalidate>
        <div class="row2">
          <div class="field"><label for="f-nombre">Nombre</label><input id="f-nombre" name="nombre" autocomplete="given-name" value="${esc(f.nombre || "")}" required><span class="err">Dinos tu nombre</span></div>
          <div class="field"><label for="f-tel">Teléfono</label><input id="f-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel" value="${esc(f.telefono || "")}" required pattern="[0-9 +]{9,15}"><span class="err">Teléfono no válido</span></div>
        </div>
        ${dom ? `<div class="field"><label for="f-dir">Dirección</label><input id="f-dir" name="direccion" autocomplete="street-address" placeholder="Calle, número, piso" value="${esc(f.direccion || "")}" required><span class="err">Necesitamos la dirección</span></div>` : ""}
        <div class="asap">⏱ <span><b>${dom ? "Te lo llevamos" : "Lo tienes listo"} lo antes posible.</b> Lo empezamos en cuanto llega y en el seguimiento ves cómo va.</span></div>
        ${hasEncargo ? `<div class="field"><label for="f-enc">Fecha del encargo (tortilla / empanada)</label><input id="f-enc" name="encargo" type="date" min="${minDate.toISOString().slice(0, 10)}" required><span class="err">Elige un día con 2 días de antelación</span></div>` : ""}
        <div class="field"><label>Pago</label>
          <div class="pay">
            ${[["Efectivo", "💶"], ["Tarjeta", "💳"]].map(([v, ic]) => `<label class="opt"><input type="radio" name="pago" value="${v}" ${(f.pago === "Tarjeta" ? "Tarjeta" : "Efectivo") === v ? "checked" : ""}><span>${ic}</span>${v}</label>`).join("")}
          </div>
          <p class="pay-hint" id="pay-hint"></p></div>
        <div class="field"><label for="f-notas">Notas o alergias <span style="font-weight:400;color:var(--muted)">(opcional)</span></label><textarea id="f-notas" name="notas" placeholder="Sin cebolla, timbre roto, alergia al gluten…"></textarea></div>
        <div class="sum"><div class="tot"><span>Total</span><span>${eur(subtotal() + envio())}</span></div></div>
        ${open ? "" : `<p class="warn">Ahora mismo estamos cerrados. ${closedText()}</p>`}
        <button class="btn btn--red btn--confirm" type="submit" ${open ? "" : "disabled"}>${open ? `Confirmar pedido · ${eur(subtotal() + envio())}` : "Cerrado ahora"}</button>
        <p class="legal">Tus datos solo se usan para preparar este pedido.</p>
      </form>
    `);
    const form = $("#cf");
    const HINTS = {
      Efectivo: dom ? "Pagas al repartidor. Si necesitas cambio, dínoslo en las notas." : "Pagas al recoger en el local.",
      Tarjeta: dom ? "El repartidor lleva datáfono." : "Pagas con tarjeta al recoger.",
    };
    const hint = () => { $("#pay-hint").textContent = HINTS[form.pago.value]; };
    form.addEventListener("change", e => { if (e.target.name === "pago") hint(); });
    hint();
    form.addEventListener("submit", e => {
      e.preventDefault();
      let ok = true;
      form.querySelectorAll("[required]").forEach(inp => {
        const bad = !inp.value.trim() || (inp.pattern && !new RegExp(`^${inp.pattern}$`).test(inp.value.trim()));
        inp.closest(".field").classList.toggle("has-err", bad);
        if (bad && ok) { inp.focus(); ok = false; }
      });
      if (!ok) return;
      if (!isOpen()) { openCheckout(); return; }   // por si cerró mientras rellenaba
      const data = Object.fromEntries(new FormData(form));
      data.hora = "Lo antes posible";
      state.form = { nombre: data.nombre, telefono: data.telefono, direccion: data.direccion || state.form.direccion, pago: data.pago };
      localStorage.setItem("chicotin-form", JSON.stringify(state.form));
      send(data);
    });
  }

  async function send(d) {
    const num = String(Math.floor(1000 + Math.random() * 9000));
    const id = newId();
    const trackUrl = `seguimiento.html?id=${id}`;
    const dom = state.mode === "domicilio";
    const btn = $("#cf button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Enviando pedido…"; }
    const total = +(subtotal() + envio()).toFixed(2);
    const lines = state.cart.map(l => ({ qty: l.qty, n: l.n, d: l.d, total: +(l.unit * l.qty).toFixed(2) }));
    try {
      await Promise.race([
        DB.createOrder({
          id, num, modo: state.mode, hora: d.hora, encargo: d.encargo || null,
          nombre: d.nombre.trim(), telefono: d.telefono.trim(), direccion: dom ? d.direccion.trim() : null,
          items: lines, total, pago: d.pago, notas: (d.notas || "").trim() || null,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("tiempo de espera")), 10000)),
      ]);
    } catch (err) {
      // No se ha guardado: NO decimos que está confirmado.
      console.error(err);
      if (btn) { btn.disabled = false; btn.textContent = "Reintentar pedido"; }
      let e = $("#send-err");
      if (!e) { e = document.createElement("p"); e.id = "send-err"; e.className = "warn"; btn?.before(e); }
      e.innerHTML = `No hemos podido enviar el pedido. Revisa tu conexión y vuelve a intentarlo, o llámanos al <a href="tel:+34${C.telefono.replace(/\D/g, "")}">${C.telefono}</a>.`;
      return;
    }

    localStorage.setItem("chicotin-ultimo", JSON.stringify({ id, num, at: Date.now() }));
    const first = esc(d.nombre.trim().split(" ")[0]);
    openSheet(`
      <div class="done">
        <div class="done__icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <p class="eyebrow">Pedido nº ${num}</p>
        <h2 style="margin-right:0">¡Pedido confirmado!</h2>
        <p class="sub">Muchas gracias, ${first}. Ya está en marcha y ${dom ? "te lo llevamos" : "lo tendrás listo para recoger"} <b>lo antes posible</b>.</p>
      </div>
      <a class="track-cta" href="${trackUrl}">
        <span><b>Ver el seguimiento del pedido</b><small>Recibido · En cocina · ${dom ? "En reparto" : "Listo para recoger"}</small></span>
        <span aria-hidden="true">→</span>
      </a>
      <div class="sum confirm-sum">
        ${lines.map(l => `<div><span>${l.qty}× ${esc(l.n)}${l.d ? `<small>${esc(l.d)}</small>` : ""}</span><span>${eur(l.total)}</span></div>`).join("")}
        <div class="tot"><span>Total</span><span>${eur(total)}</span></div>
        <div><span>Pago</span><span>${esc(d.pago)} ${dom ? "al repartidor" : "al recoger"}</span></div>
        ${dom ? `<div><span>Entrega en</span><span>${esc(d.direccion)}</span></div>` : `<div><span>Recogida en</span><span>${esc(C.direccion)}</span></div>`}
      </div>
      <p class="legal">¿Algún problema? Llámanos al <a href="tel:+34${C.telefono.replace(/\D/g, "")}">${C.telefono}</a>.</p>
      <div class="send-alt"><button class="btn btn--ghost" id="nuevo">Hacer otro pedido</button></div>
    `);
    state.cart = []; renderCartbar(); refreshBadges();
    const og = $("#ongoing");
    og.href = trackUrl; og.innerHTML = `<i></i> Tienes un pedido en curso (#${num}) <b>Ver estado →</b>`; og.hidden = false;
    $("#nuevo").onclick = closeSheet;
  }

  /* ── Modo domicilio / recoger ───────────── */
  const modeEl = $(".mode");
  modeEl.addEventListener("click", e => {
    const b = e.target.closest(".mode__opt"); if (!b) return;
    state.mode = b.dataset.mode; modeEl.dataset.mode = state.mode;
    modeEl.querySelectorAll(".mode__opt").forEach(o => { const on = o === b; o.classList.toggle("is-on", on); o.setAttribute("aria-checked", on); });
    renderCartbar();
  });

  /* ── Detalles de movimiento ─────────────── */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fly(fromEl) {
    if (reduce || !fromEl) return;
    const a = (fromEl.querySelector?.(".item__plus") || fromEl).getBoundingClientRect();
    const bar = $("#cartbar"); const wasHidden = bar.hidden; bar.hidden = false;
    const b = $("#cart-n").getBoundingClientRect(); bar.hidden = wasHidden;
    const dot = document.createElement("div"); dot.className = "flyer"; document.body.appendChild(dot);
    const x0 = a.left + a.width / 2 - 9, y0 = a.top + a.height / 2 - 9, x1 = b.left + b.width / 2 - 9, y1 = b.top + b.height / 2 - 9;
    dot.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(1)` },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 120}px) scale(1.3)`, offset: .45 },
      { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: .6 },
    ], { duration: 650, easing: "cubic-bezier(.5,0,.5,1)" }).onfinish = () => dot.remove();
  }

  let tt;
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("is-on"); clearTimeout(tt); tt = setTimeout(() => el.classList.remove("is-on"), 1600); }

  // Sello que sigue al puntero
  const disc = $(".seal__disc");
  if (!reduce && matchMedia("(hover: hover)").matches) {
    addEventListener("pointermove", e => {
      const r = disc.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      disc.style.transform = `rotateY(${dx * 40}deg) rotateX(${-dy * 40}deg)`;
    });
    // Inclinación 3D sutil en las tarjetas
    document.addEventListener("pointermove", e => {
      const it = e.target.closest?.(".item");
      document.querySelectorAll(".item.tilt").forEach(o => { if (o !== it) { o.classList.remove("tilt"); o.style.transform = ""; } });
      if (!it) return;
      const r = it.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      it.classList.add("tilt");
      it.style.transform = `perspective(900px) rotateX(${-py * 4}deg) rotateY(${px * 4}deg) translateZ(4px)`;
    });
  }

  addEventListener("scroll", () => $(".top").classList.toggle("is-scrolled", scrollY > 8), { passive: true });

  function observe() {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach((el, i) => { el.style.transitionDelay = `${(i % 6) * 40}ms`; io.observe(el); });

    const links = [...document.querySelectorAll(".cats a")];
    const spy = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.toggle("is-on", a.dataset.cat === e.target.id));
      const on = links.find(a => a.dataset.cat === e.target.id);
      on?.parentElement.scrollTo({ left: on.offsetLeft - 20, behavior: "smooth" });
    }), { rootMargin: "-130px 0px -65% 0px" });
    ["menu-dia", ...CARTA.map(c => "cat-" + c.id)].forEach(id => spy.observe(document.getElementById(id)));
  }

  // Aviso de "pedido en curso" si el cliente vuelve a la página.
  try {
    const u = JSON.parse(localStorage.getItem("chicotin-ultimo") || "null");
    if (u && Date.now() - u.at < 6 * 3600e3) {
      const el = $("#ongoing");
      el.href = `seguimiento.html?id=${encodeURIComponent(u.id)}`;
      el.innerHTML = `<i></i> Tienes un pedido en curso (#${esc(u.num)}) <b>Ver estado →</b>`;
      el.hidden = false;
    }
  } catch {}

  renderStatus(); setInterval(renderStatus, 60000);
  renderMdd(); renderCarta(); observe();
})();
