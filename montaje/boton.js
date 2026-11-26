// Montaje para la demo: añade el botón "Pedir online" a chicotin.com SOLO en tu navegador.
// No cambia nada en su web real; al recargar la página desaparece.
// Uso: abre chicotin.com, abre la consola (F12) y pega este archivo, o usa el marcador de montaje/index.html.
(function () {
  var URL_PEDIDOS = window.__URL_PEDIDOS || "http://localhost:5483/";
  if (document.getElementById("pedir-online-demo")) return;

  var css = document.createElement("style");
  css.textContent =
    ".po-btn{display:inline-flex;align-items:center;gap:8px;background:#1C1B18!important;color:#fff!important;" +
    "border-color:#1C1B18!important;animation:poIn .6s cubic-bezier(.22,1,.36,1)}" +
    ".po-btn:hover{background:#000!important}" +
    ".po-dot{width:8px;height:8px;border-radius:50%;background:#3DDC84;box-shadow:0 0 0 0 rgba(61,220,132,.6);animation:poP 2s infinite}" +
    ".po-nav{margin-right:10px;padding:8px 16px;border-radius:99px;background:#C0392B;color:#fff!important;font-weight:600;text-decoration:none;font-size:14px}" +
    "@keyframes poIn{from{opacity:0;transform:translateY(8px) scale(.96)}}" +
    "@keyframes poP{70%{box-shadow:0 0 0 8px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}";
  document.head.appendChild(css);

  // 1) Botón grande junto a "Llamar para pedir"
  var links = Array.prototype.slice.call(document.querySelectorAll("a"));
  var llamar = links.find(function (a) { return /Llamar para pedir/i.test(a.textContent); });
  if (llamar) {
    var b = llamar.cloneNode(false);
    b.id = "pedir-online-demo";
    b.href = URL_PEDIDOS;
    b.removeAttribute("target");
    b.className = llamar.className + " po-btn";
    b.innerHTML = '<span class="po-dot"></span>Pedir online';
    llamar.parentNode.insertBefore(b, llamar);
  }

  // 2) Botón en la cabecera, junto al teléfono
  var tel = links.find(function (a) { return /^tel:/.test(a.getAttribute("href") || "") && a.closest("nav, header"); });
  if (tel) {
    var n = document.createElement("a");
    n.href = URL_PEDIDOS; n.className = "po-nav"; n.textContent = "Pedir online";
    tel.parentNode.insertBefore(n, tel);
  }
})();
