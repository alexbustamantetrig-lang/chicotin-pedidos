# Chicotín · Pedidos online (demo)

Página de pedidos independiente de chicotin.com. El cliente elige, rellena sus datos y el pedido
se envía ya formateado por WhatsApp al restaurante. Sin servidor, sin base de datos y sin comisiones.

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

## Siguiente fase (cuando haga falta)
- Menú del día leído de un Google Sheets que ellos editan desde el móvil.
- Panel de pedidos en una tablet en lugar de WhatsApp, con límite de pedidos por franja y pago online.
