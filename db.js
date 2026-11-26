// ─────────────────────────────────────────────────────────────
//  Capa de datos de los pedidos.
//  · Sin Supabase configurado → modo LOCAL: los pedidos se guardan en este navegador.
//    Sirve para probar en un solo ordenador (pedido en una pestaña, panel en otra).
//  · Con SUPABASE_URL y SUPABASE_ANON_KEY → modo REAL: los pedidos van a la base de datos
//    y el panel de la tablet los recibe al instante, vengan del móvil que vengan.
//  La anon key de Supabase es pública por diseño: la seguridad la ponen las reglas (RLS)
//  de supabase/esquema.sql. NUNCA pongas aquí la "service_role" key.
// ─────────────────────────────────────────────────────────────
window.SUPABASE_URL = "";
window.SUPABASE_ANON_KEY = "";

(() => {
  const LS = "chicotin-pedidos-local";
  const read = () => JSON.parse(localStorage.getItem(LS) || "[]");
  const write = list => localStorage.setItem(LS, JSON.stringify(list));
  const PUBLIC = ["num", "status", "modo", "hora", "items", "total", "created_at", "updated_at"];

  const local = {
    mode: "local",
    async createOrder(o) {
      const now = new Date().toISOString();
      write([...read(), { ...o, status: "nuevo", created_at: now, updated_at: now }]);
    },
    async getTracking(id) {
      const o = read().find(x => x.id === id);
      return o ? Object.fromEntries(PUBLIC.map(k => [k, o[k]])) : null;
    },
    async listOrders() {
      const since = Date.now() - 18 * 3600e3;
      return read().filter(o => new Date(o.created_at) > since).sort((a, b) => a.created_at < b.created_at ? 1 : -1);
    },
    async updateStatus(id, status) {
      write(read().map(o => o.id === id ? { ...o, status, updated_at: new Date().toISOString() } : o));
    },
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
        if (error) throw error;
      },
      async getTracking(id) {
        const { data, error } = await sb.rpc("seguimiento", { p_id: id });
        if (error) throw error;
        return data && data[0] || null;
      },
      async listOrders() {
        const since = new Date(Date.now() - 18 * 3600e3).toISOString();
        const { data, error } = await sb.from("pedidos").select("*").gte("created_at", since).order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      },
      async updateStatus(id, status) {
        const { error } = await sb.from("pedidos").update({ status }).eq("id", id);
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
