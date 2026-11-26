# Chicotín · Pedidos online (demo)

Página de pedidos independiente de chicotin.com. El cliente elige, rellena sus datos y el pedido
llega al panel de cocina (Supabase), con enlace de seguimiento para el cliente. Sin comisiones.

## Archivos
- `index.html`, `styles.css`, `app.js`: la página.
- `carta.js`: **lo único que se edita normalmente**: platos, precios, horario, menú del día y número de WhatsApp.
- `montaje/`: marcador para enseñar el botón "Pedir online" encima de chicotin.com, solo en tu navegador.

## Probar en local
Arranca el servidor `chicotin-pedidos` (puerto 5483) y abre http://localhost:5483

Con `whatsapp: ""` en `carta.js` (modo demo), WhatsApp se abre y eliges tú el destinatario: mándatelo a ti mismo.
Para la demo con el dueño, pon tu móvil (`"34600123456"`) y verás cómo llega el pedido.

## Subirlo (gratis)
1. Crea un repositorio en GitHub (por ejemplo `chicotin-pedidos`) y sube esta carpeta.
2. Entra en vercel.com con tu cuenta de GitHub → *Add New Project* → elige el repo → *Deploy*.
   Te da una URL tipo `chicotin-pedidos.vercel.app`. Cada cambio que subas a GitHub se publica solo.
3. Cuando el dueño diga que sí:
   - En `carta.js`, pon el número de WhatsApp del restaurante.
   - En Vercel → *Settings → Domains*, añade `pedidos.chicotin.com`.
   - Quien gestione su dominio añade el registro DNS: `CNAME  pedidos  →  cname.vercel-dns.com`.
   - El diseñador pone un botón "Pedir online" que enlace a `https://pedidos.chicotin.com`.
   - Añade el enlace en el perfil de Google (enlace de pedido) y en la bio de Instagram.

## Panel de cocina y seguimiento
- `panel.html`: app del restaurante con pestañas: En cocina (los pedidos entran solos desde la cola, `capacidadCocina` a la vez; elegir repartidor, varios a la vez) · En cola (solo para cancelar) → En reparto (ruta por repartidor, "ha vuelto") → Caja (facturado hoy, efectivo por repartidor, medias y saldo de los últimos 30 días),
  con aviso sonoro de pedido nuevo y botón 💬 para avisar al cliente por WhatsApp con un toque.
- `seguimiento.html?id=…`: el cliente ve en directo en qué paso va su pedido. El enlace sale en el WhatsApp
  del pedido y en la pantalla final.
- `db.js`: sin Supabase funciona en **modo demo** (los pedidos solo se ven en el mismo navegador).

### Conectar Supabase (para que el panel reciba pedidos de cualquier móvil)
1. Crea un proyecto gratis en supabase.com (región Europa).
2. *SQL Editor* → pega `supabase/esquema.sql` → *Run*.
3. *Authentication → Sign In / Providers*: desactiva "Allow new users to sign up".
4. *Authentication → Users → Add user*: correo y contraseña del restaurante. Luego ejecuta en el SQL Editor
   la línea `insert into public.personal ...` del final del esquema con ese correo.
5. *Project Settings → API*: copia la **Project URL** y la **anon public key** en `db.js`.
   (Nunca la `service_role`.) Sube los cambios a GitHub.

## Seguridad de los pedidos (lo hace la base de datos)
- **Anti-spam:** como mucho 4 pedidos cada 15 min y 3 en espera por conexión, y 2 en espera por teléfono.
- **Límite de cocina:** 10 en espera; solo cuentan los de las últimas 3 h y no cuentan los encargos.
- **Precios:** cada pedido se recalcula con la carta. Si el precio, el total, el horario o la fecha del encargo
  no cuadran, el pedido **no se rechaza**: sale en rojo en el panel ("Revisar antes de cobrar").
- La carta la sube el panel al abrirse. **Después de cambiar `carta.js`, recarga el panel una vez.**
- Tras actualizar el código, vuelve a ejecutar `supabase/esquema.sql` entero en el SQL Editor (se puede repetir sin problema).
- Antes de dárselo al restaurante: `modoPruebas: false` en `carta.js`.

## Siguiente fase (cuando haga falta)
- Menú del día leído de un Google Sheets que ellos editan desde el móvil.
- Avisos automáticos por la API de WhatsApp Business, límite de pedidos por franja y pago online.
