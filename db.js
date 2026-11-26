// ─────────────────────────────────────────────────────────────
//  Capa de datos de los pedidos.
//  · Sin Supabase configurado → modo LOCAL: los pedidos se guardan en este navegador.
//    Sirve para probar en un solo ordenador (pedido en una pestaña, panel en otra).
//  · Con SUPABASE_URL y SUPABASE_ANON_KEY → modo REAL: los pedidos van a la base de datos
//    y el panel de la tablet los recibe al instante, vengan del móvil que vengan.
//  La anon key de Supabase es pública por diseño: la seguridad la ponen las reglas (RLS)
//  de supabase/esquema.sql. NUNCA pongas aquí la "service_role" key.
// ─────────────────────────────────────────────────────────────
window.SUPABASE_URL = "https://jruryozgzketargyuhgk.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_ZtBU8gYkZrUzDlBf_TuXJw_4NJmy4D-";   // clave "publishable" (pública)

(() => {
  const LS = "chicotin-pedidos-local";
  const read = () => JSON.parse(localStorage.getItem(LS) || "[]");
  const write = list => localStorage.setItem(LS, JSON.stringify(list));
  // Máximo de pedidos sin pasar a cocina. El de verdad está en la base de datos
  // (función limite_pedidos() en supabase/esquema.sql); este solo vale para el modo demo.
  const LIMITE_LOCAL = 10;
  const fail = (code, msg) => Object.assign(new Error(msg), { code });
  const PUBLIC = ["num", "status", "modo", "hora", "items", "total", "created_at", "updated_at"];
  // Pedidos que aún no han terminado: el panel los enseña aunque sean de hace días (encargos, olvidados).
  const ACTIVOS = ["nuevo", "cocina", "reparto", "listo"];
  // Mismo criterio que en_espera_ahora() de la base de datos: sin encargos y de las últimas 3 horas.
  window.cuentaEspera = list => list.filter(o => o.status === "nuevo" && !o.encargo && Date.now() - new Date(o.created_at) < 3 * 3600e3).length;
  // Traduce los errores que lanza la base de datos (supabase/esquema.sql) a códigos que entiende la web.
  const CODES = ["LIMITE_PEDIDOS", "DEMASIADOS_PEDIDOS", "NUM_REPETIDO", "DATOS_NO_VALIDOS"];

  // Igual que llenar_cocina() de la base de datos: rellena la cocina con la cola, por orden de llegada.
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function llenarCocina(list) {
    const cap = Math.max(1, +(window.CONFIG && window.CONFIG.capacidadCocina) || 4);
    let hueco = cap - list.filter(o => o.status === "cocina").length;
    const now = new Date().toISOString();
    list.filter(o => o.status === "nuevo" && (!o.encargo || o.encargo <= hoy()))
      .sort((a, b) => a.created_at > b.created_at ? 1 : -1)
      .forEach(o => { if (hueco-- > 0) { o.status = "cocina"; o.updated_at = now; } });
    return list;
  }

  const local = {
    mode: "local",
    async createOrder(o) {
      const all = read();
      if (all.some(x => x.id === o.id)) return;                                   // reintento del mismo pedido
      if (all.some(x => x.num === o.num && Date.now() - new Date(x.created_at) < 864e5)) throw fail("NUM_REPETIDO", "Número repetido");
      if (!o.encargo && cuentaEspera(all) >= LIMITE_LOCAL) throw fail("LIMITE_PEDIDOS", "Demasiados pedidos en espera");
      const now = new Date().toISOString();
      write(llenarCocina([...all, { ...o, status: "nuevo", created_at: now, updated_at: now }]));
    },
    async getTracking(id) {
      const o = read().find(x => x.id === id);
      return o ? Object.fromEntries(PUBLIC.map(k => [k, o[k]])) : null;
    },
    async listOrders(hours = 18) {
      const since = Date.now() - hours * 3600e3;
      return read().filter(o => new Date(o.created_at) > since || ACTIVOS.includes(o.status)).sort((a, b) => a.created_at < b.created_at ? 1 : -1);
    },
    async getSetting(k) { return JSON.parse(localStorage.getItem("chicotin-ajuste-" + k) || "null"); },
    async setSetting(k, v) { localStorage.setItem("chicotin-ajuste-" + k, JSON.stringify(v)); },
    // patch: { status, repartidor, ... } aplicado a varios pedidos a la vez
    async updateOrders(ids, patch) {
      const now = new Date().toISOString();
      write(llenarCocina(read().map(o => ids.includes(o.id) ? { ...o, ...patch, updated_at: now } : o)));
    },
    async seed(list) { write([...read(), ...list]); },
    async waiting() { return { en_espera: cuentaEspera(read()), limite: LIMITE_LOCAL }; },
    subscribe(cb) { addEventListener("storage", e => { if (e.key === LS) cb(); }); },
    async session() { return { local: true }; },
    async signIn() { return {}; },
    async signOut() {},
  };

  function remote() {
    const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return {
      mode: "supabase",
      async createOrder(o) {
        const { error } = await sb.from("pedidos").insert(o);
        if (!error) return;
        if (error.code === "23505" && /pedidos_pkey/.test(error.message)) return;   // ya se guardó en el intento anterior
        if (error.code === "23514") throw fail("DATOS_NO_VALIDOS", error.message);   // algún campo demasiado largo
        const code = CODES.find(c => (error.message || "").includes(c));
        throw code ? fail(code, error.message) : error;
      },
      async waiting() {
        const { data, error } = await sb.rpc("pedidos_en_espera");
        if (error) throw error;
        return data && data[0] || { en_espera: 0, limite: 10 };
      },
      async getTracking(id) {
        const { data, error } = await sb.rpc("seguimiento", { p_id: id });
        if (error) throw error;
        return data && data[0] || null;
      },
      async listOrders(hours = 18) {
        const since = new Date(Date.now() - hours * 3600e3).toISOString();
        // Supabase devuelve como mucho 1000 filas por consulta: la caja de 30 días se pide por páginas.
        const out = new Map(), PAGE = 1000;   // Map por id: si entra un pedido entre páginas, no se cuenta dos veces
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await sb.from("pedidos").select("*")
            .or(`created_at.gte."${since}",status.in.(${ACTIVOS.join(",")})`)
            .order("created_at", { ascending: false }).order("id").range(from, from + PAGE - 1);
          if (error) throw error;
          data.forEach(o => out.set(o.id, o));
          if (data.length < PAGE) return [...out.values()];
        }
      },
      async getSetting(k) {
        const { data, error } = await sb.from("ajustes").select("valor").eq("clave", k).maybeSingle();
        if (error) throw error;
        return data ? data.valor : null;
      },
      async setSetting(k, v) {
        const { error } = await sb.from("ajustes").upsert({ clave: k, valor: v, updated_at: new Date().toISOString() });
        if (error) throw error;
      },
      async updateOrders(ids, patch) {
        const { error } = await sb.from("pedidos").update(patch).in("id", ids);
        if (error) throw error;
      },
      subscribe(cb) {
        sb.channel("pedidos").on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, cb).subscribe();
      },
      async session() { return (await sb.auth.getSession()).data.session; },
      async signIn(email, password) { return sb.auth.signInWithPassword({ email, password }); },
      async signOut() { await sb.auth.signOut(); },
    };
  }

  window.DB = window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase ? remote() : local;

  // Identificador imposible de adivinar para el enlace de seguimiento.
  window.newId = () => (crypto.randomUUID ? crypto.randomUUID() :
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

  // Estados y textos compartidos por el panel y el seguimiento.
  window.ESTADOS = {
    domicilio: [["nuevo", "Recibido"], ["cocina", "En cocina"], ["reparto", "En reparto"], ["entregado", "Entregado"]],
    recoger: [["nuevo", "Recibido"], ["cocina", "En cocina"], ["listo", "Listo para recoger"], ["entregado", "Recogido"]],
  };
})();
