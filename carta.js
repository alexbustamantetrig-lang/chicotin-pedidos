// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN Y CARTA DE CHICOTÍN
//  Carta copiada de chicotin.com (noviembre 2026).
//  Para cambiar precios o platos, solo se edita este archivo.
// ─────────────────────────────────────────────────────────────

window.CONFIG = {
  nombre: "Chicotín",
  // Número de WhatsApp que recibe los pedidos, con prefijo y sin espacios (ej. "34600123456").
  // Vacío = modo demo: WhatsApp se abre y eliges tú a quién mandarlo (pruébalo contigo mismo).
  whatsapp: "",
  telefono: "984 18 29 32",
  direccion: "Avenida Eysines 24, bajo · Piedras Blancas",
  pedidoMinimoDomicilio: 12,
  gastosEnvio: 0,            // € por pedido a domicilio (0 = gratis)
  minutosPreparacion: 30,    // primera hora disponible = ahora + esto
  intervaloFranjas: 15,      // minutos entre franjas horarias
  // Horario: 0 = domingo … 6 = sábado. Cada tramo ["HH:MM","HH:MM"].
  horario: {
    0: [["11:30", "16:00"], ["19:30", "23:00"]],
    1: [],
    2: [["11:30", "15:30"]],
    3: [["11:30", "15:30"]],
    4: [["11:30", "15:30"], ["19:30", "23:00"]],
    5: [["11:30", "15:30"], ["19:30", "23:00"]],
    6: [["11:30", "15:30"], ["19:30", "23:00"]],
  },
};

// Menú del día: cambia cada día. En producción esto se leería de una hoja de
// Google Sheets que el restaurante edita desde el móvil.
window.MENU_DIA = {
  precioSemana: 12,
  precioFinde: 18,
  primeros: ["Fabada asturiana", "Crema de calabaza"],
  segundos: ["Cachopo de ternera", "Merluza a la sidra"],
  acompanamientos: ["Patatas", "Arroz", "Ensalada"],
  postres: ["Arroz con leche", "Flan casero"],
};

const SALSAS = ["Pimienta", "Cabrales", "Champiñones"];

window.CARTA = [
  {
    id: "hamburguesas",
    nombre: "Hamburguesas",
    nota: "Todas van acompañadas de patatas",
    platos: [
      { n: "Pollo", d: "Pollo crujiente, queso, lechuga, cebolla caramelizada y mayonesa", p: 9.5, extras: "burger" },
      { n: "Bacon y Queso", d: "Carne de vacuno, bacon y queso cheddar", p: 10, extras: "burger" },
      { n: "Barbacoa", d: "Vacuno, cheddar, bacon, lechuga, cebolla caramelizada y salsa BBQ", p: 10.2, extras: "burger" },
      { n: "Picante", d: "Vacuno, cheddar, bacon, cebolla cruda, lechuga y jalapeños", p: 10.5, extras: "burger", tag: "Pica" },
      { n: "Queso de Cabra", d: "Vacuno, queso de cabra, bacon y mermelada de tomate", p: 11.5, extras: "burger" },
      { n: "Chicotín", d: "Vacuno, bacon, cheddar, pepinillo, lechuga, cebolla caramelizada y tomate", p: 10.5, extras: "burger", tag: "La de la casa" },
      { n: "Chicotín Animal", d: "La Chicotín, pero doble", p: 13.5, extras: "burger", tag: "Doble" },
      { n: "Vegana", d: "Casera de garbanzos, tomate, calabacín, cebolla, lechuga y queso vegano", p: 10.5, extras: "burger", tag: "Vegana" },
      { n: "Vacuno", d: "Solo carne de vacuno", p: 9.5, extras: "burger" },
    ],
  },
  {
    id: "bocadillos",
    nombre: "Bocadillos",
    platos: [
      { n: "Pollo", d: "Pollo a la plancha, lechuga, tomate y mayonesa", p: 7 },
      { n: "Pollo y Pimientos", d: "Pollo a la plancha y pimientos del piquillo", p: 7 },
      { n: "Lomo", d: "Lomo adobado a la plancha, queso y salsa Chicotín", p: 7 },
      { n: "Lomo y Pimientos", d: "Lomo adobado a la plancha con pimientos del piquillo", p: 7 },
      { n: "Bacon y Queso", d: "", p: 7 },
      { n: "Carne Guisada", d: "", p: 9 },
      { n: "Chicotín", d: "Chuleta de cerdo crujiente, queso, bacon, cebolla caramelizada, rúcula y salsa Chicotín", p: 8, tag: "La de la casa" },
      { n: "Escalopines de Jamón de Cerdo", d: "Con una salsa a elegir", p: 7, opciones: { titulo: "Salsa", valores: SALSAS } },
      { n: "Escalopines de Pollo", d: "Con una salsa a elegir", p: 7, opciones: { titulo: "Salsa", valores: SALSAS } },
    ],
  },
  {
    id: "sandwiches",
    nombre: "Sándwiches",
    platos: [
      { n: "Mixto", d: "Jamón york y queso", p: 4 },
      { n: "Vegetal", d: "2 pisos: jamón york y queso · LTC, huevo cocido, zanahoria y mayonesa", p: 7 },
      { n: "Pollo", d: "Pollo al horno, lechuga, huevo cocido y mayonesa", p: 7.5 },
      { n: "Atún", d: "Atún, mayonesa, lechuga, huevo cocido y zanahoria", p: 7.5 },
      { n: "Chicotín", d: "2 pisos: jamón york, queso, bechamel y huevo frito", p: 8 },
    ],
  },
  {
    id: "especialidades",
    nombre: "Especialidades",
    platos: [
      { n: "Ensalada Chicotín", d: "Lechuga, aceitunas, nueces, queso de cabra, pollo y uvas pasas", p: 10 },
      { n: "Ensalada Mixta", d: "", p: 7.5 },
      { n: "Ensalada de Acompañamiento", d: "", p: 3.5 },
      { n: "Ensaladilla Rusa", d: "", variantes: [["Pequeña", 6.5], ["Grande", 11.5]] },
      { n: "Callos Chicotín", d: "De temporada", variantes: [["Sin patatas", 9], ["Con patatas", 11]] },
      { n: "Lasaña", d: "", p: 8.5, opciones: { titulo: "Elige", valores: ["Atún", "Carne"] } },
      { n: "Lasaña de Salmón y Espinacas", d: "", p: 9 },
      { n: "Cachopo de Jamón Ibérico y Queso", d: "", p: 16 },
      { n: "Cachopo de Cecina y Queso de Cabra", d: "", p: 16.5 },
      { n: "Cachopo Chicotín", d: "Ternera, jamón ibérico, pimientos del piquillo, cebolla caramelizada y queso ahumado", p: 18, tag: "Estrella" },
      { n: "Escalopines con Patatas", d: "", p: 9.5 },
      { n: "Escalopines de Pollo con Patatas", d: "", p: 10.5 },
      { n: "Albóndigas", d: "", variantes: [["Sin patatas", 7.5], ["Con patatas", 9.5]] },
      { n: "Carne Guisada", d: "", variantes: [["Sin patatas", 9], ["Con patatas", 11]] },
      { n: "Patatas Pequeñas con Salsa", d: "", p: 4.7 },
      { n: "Patatas Grandes con 5 Salsas", d: "", p: 7 },
      { n: "Nuggets Caseros", d: "", p: 6.5 },
      { n: "Croquetas", d: "", p: 9, opciones: { titulo: "Sabor", valores: ["Jamón ibérico", "Calamares en su tinta", "Bacalao"] } },
    ],
  },
  {
    id: "encargo",
    nombre: "Por encargo",
    nota: "Mínimo 2 días de antelación",
    platos: [
      { n: "Tortilla Grande", d: "", p: 14.5, encargo: true },
      { n: "Empanada de Atún", d: "", p: 20, encargo: true },
      { n: "Empanada de Carne", d: "", p: 26, encargo: true },
    ],
  },
  {
    id: "postres",
    nombre: "Postres",
    platos: [
      { n: "Mousse", d: "Individual", p: 2 },
      { n: "Natillas", d: "Individuales", p: 2 },
      { n: "Arroz con Leche", d: "", variantes: [["Individual", 2], ["500 ml", 7.5], ["1 litro", 10.5]] },
    ],
  },
  {
    id: "bebidas",
    nombre: "Bebidas",
    platos: [
      { n: "Refresco en lata", d: "", p: 2, opciones: { titulo: "Elige", valores: ["Cola", "Cola Zero", "Cola Zero Zero"] } },
      { n: "Refresco ½ litro", d: "", p: 2.3, opciones: { titulo: "Elige", valores: ["Cola", "Cola Zero", "Fanta Naranja"] } },
      { n: "Refresco 1 litro", d: "", p: 2.9, opciones: { titulo: "Elige", valores: ["Cola", "Fanta Naranja"] } },
      { n: "Agua", d: "", variantes: [["Pequeña", 1.2], ["Grande", 1.8]] },
      { n: "Nestea / Aquarius", d: "", p: 2.4, opciones: { titulo: "Elige", valores: ["Nestea", "Aquarius"] } },
      { n: "Monster", d: "", p: 3 },
      { n: "Mahou", d: "", p: 1.8 },
      { n: "Cerveza 1906", d: "", p: 2 },
    ],
  },
];

window.EXTRAS = {
  burger: [["Queso", 1], ["Bacon", 1], ["Huevo frito", 1.5], ["Cebolla caramelizada", 0.8]],
};
