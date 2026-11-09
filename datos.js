// =========================================================
// datos.js: guarda la información y hace todos los cálculos.
// Aquí no se dibuja nada en pantalla.
// =========================================================

// Nombre con el que se guardan los datos dentro del navegador.
// OJO: conserva el nombre viejo de la app a propósito. Si se cambia,
// la app deja de encontrar los datos que ya están guardados.
const CLAVE_GUARDADO = 'mis-finanzas-v1';

// Tipos de cuenta que se pueden escoger
const TIPOS_CUENTA = {
  efectivo: 'Efectivo',
  banco: 'Cuenta de banco',
  billetera: 'Billetera digital',
  credito: 'Tarjeta de crédito',
};

// Métodos de pago que trae la app, además de Efectivo. Se manejan como cuentas:
// así salen en la lista al agregar un movimiento y cada uno lleva su saldo.
const METODOS_PAGO = [
  { id: 'transferencia', nombre: 'Transferencia', tipo: 'banco', saldoInicial: 0 },
  { id: 'nequi', nombre: 'Nequi', tipo: 'billetera', saldoInicial: 0 },
  { id: 'lulo-bank', nombre: 'Lulo Bank', tipo: 'banco', saldoInicial: 0 },
];

// ---------------------------------------------------------
// Fechas
// Las fechas se guardan como texto: '2026-11-08'.
// Los meses se manejan igual: '2026-11'.
// ---------------------------------------------------------

// Devuelve la fecha de hoy según la hora del computador.
// No se usa toISOString() porque trabaja en hora universal: en Colombia,
// después de las 7 p. m. daría la fecha de mañana.
function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// '2026-11-08' -> '2026-11'
function mesDe(fecha) {
  return fecha.slice(0, 7);
}

// Suma (o resta) meses: sumarMeses('2026-01', -1) -> '2025-12'
function sumarMeses(mes, cantidad) {
  const [anio, numero] = mes.split('-').map(Number);
  const d = new Date(anio, numero - 1 + cantidad, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// '2026-11' -> 'Noviembre de 2026'
function nombreMes(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  const texto = new Date(anio, numero - 1, 1)
    .toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// '2026-11' -> 'nov'
function mesCorto(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  return new Date(anio, numero - 1, 1)
    .toLocaleDateString('es-CO', { month: 'short' })
    .replace('.', '');
}

// '2026-11-08' -> '8 nov'
function fechaCorta(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia)
    .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

// ---------------------------------------------------------
// Formato de dinero (pesos colombianos sin centavos)
// ---------------------------------------------------------
const formatoPesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
  useGrouping: 'always',
});

// 1250000 -> '$ 1.250.000'
function pesos(valor) {
  return formatoPesos.format(valor);
}

// Versión corta para los ejes de la gráfica: 1500000 -> '1,5 M'
function pesosCorto(valor) {
  if (valor >= 1000000) {
    return `${(valor / 1000000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  }
  if (valor >= 1000) return `${Math.round(valor / 1000)} mil`;
  return String(valor);
}

// ---------------------------------------------------------
// Datos iniciales
// ---------------------------------------------------------
function crearId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function estadoInicial() {
  // Convierte una lista de nombres en categorías de un tipo
  const categorias = (tipo, nombres) => nombres.map((nombre, i) => ({
    id: `${tipo}-${i + 1}`,
    nombre,
    tipo,
  }));

  return {
    cuentas: [
      { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 },
      ...METODOS_PAGO.map((metodo) => ({ ...metodo })),
    ],
    metodosPagoAgregados: true,
    categorias: [
      ...categorias('gasto', ['Mercado y comida', 'Arriendo', 'Servicios', 'Transporte', 'Salud',
        'Educación', 'Ropa', 'Diversión', 'Deudas', 'Otros gastos']),
      ...categorias('ingreso', ['Salario', 'Negocio', 'Ventas', 'Regalos', 'Otros ingresos']),
    ],
    movimientos: [],
    presupuestos: {}, // ejemplo: { 'gasto-1': 800000 }
    deudas: [],
    esEjemplo: false,
  };
}

// ---------------------------------------------------------
// Revisar datos que vienen de afuera (un respaldo o lo guardado).
// Si algo está mal se lanza un error y NO se toca nada de lo actual.
// ---------------------------------------------------------
function normalizarDatos(datos) {
  const esTexto = (valor) => typeof valor === 'string' && valor.trim() !== '';
  const fallar = (mensaje) => { throw new Error(mensaje); };

  if (!datos || !Array.isArray(datos.cuentas) || !Array.isArray(datos.categorias)
      || !Array.isArray(datos.movimientos)) {
    fallar('El archivo no es un respaldo de Mis Lukas.');
  }

  const cuentas = datos.cuentas.map((c) => {
    if (!esTexto(c?.id) || !esTexto(c.nombre) || !Number.isSafeInteger(c.saldoInicial)) {
      fallar('Hay una cuenta con datos incorrectos.');
    }
    const tipo = Object.hasOwn(TIPOS_CUENTA, c.tipo) ? c.tipo : 'efectivo';
    return { id: c.id, nombre: c.nombre, tipo, saldoInicial: c.saldoInicial };
  });
  if (cuentas.length === 0) fallar('El respaldo no tiene ninguna cuenta.');

  // A quien ya usaba la app se le agregan los métodos de pago una sola vez,
  // sin repetir los que ya creó. La marca evita que reaparezca uno que borre.
  if (datos.metodosPagoAgregados !== true && datos.esEjemplo !== true) {
    for (const metodo of METODOS_PAGO) {
      const yaExiste = cuentas.some((c) => c.id === metodo.id
        || c.nombre.trim().toLowerCase() === metodo.nombre.toLowerCase());
      if (!yaExiste) cuentas.push({ ...metodo });
    }
  }

  const categorias = datos.categorias.map((c) => {
    if (!esTexto(c?.id) || !esTexto(c.nombre) || !['gasto', 'ingreso'].includes(c.tipo)) {
      fallar('Hay una categoría con datos incorrectos.');
    }
    return { id: c.id, nombre: c.nombre, tipo: c.tipo };
  });

  const existeCuenta = (id) => cuentas.some((c) => c.id === id);
  const existeCategoria = (id, tipo) => categorias.some((c) => c.id === id && c.tipo === tipo);

  // Los datos guardados antes de existir esta sección no traen deudas: se usa una lista vacía
  const deudas = (datos.deudas ?? []).map((d) => {
    const correcto = d && esTexto(d.id) && esTexto(d.acreedor)
      && ['persona', 'entidad'].includes(d.tipoAcreedor)
      && Number.isSafeInteger(d.monto) && d.monto > 0
      && (d.vencimiento === '' || /^\d{4}-\d{2}-\d{2}$/.test(d.vencimiento));
    if (!correcto) fallar('Hay una deuda con datos incorrectos.');
    return {
      id: d.id,
      acreedor: d.acreedor,
      tipoAcreedor: d.tipoAcreedor,
      monto: d.monto,
      vencimiento: d.vencimiento,
      nota: typeof d.nota === 'string' ? d.nota : '',
    };
  });

  const movimientos = datos.movimientos.map((m) => {
    const correcto = m && esTexto(m.id)
      && Number.isSafeInteger(m.monto) && m.monto > 0
      && /^\d{4}-\d{2}-\d{2}$/.test(m.fecha)
      && existeCuenta(m.cuentaId)
      && (m.tipo === 'transferencia'
        ? existeCuenta(m.cuentaDestinoId) && m.cuentaDestinoId !== m.cuentaId
        : ['gasto', 'ingreso'].includes(m.tipo) && existeCategoria(m.categoriaId, m.tipo));
    if (!correcto) fallar('Hay un movimiento con datos incorrectos.');

    return {
      id: m.id,
      tipo: m.tipo,
      monto: m.monto,
      fecha: m.fecha,
      cuentaId: m.cuentaId,
      cuentaDestinoId: m.tipo === 'transferencia' ? m.cuentaDestinoId : null,
      categoriaId: m.tipo === 'transferencia' ? null : m.categoriaId,
      descripcion: typeof m.descripcion === 'string' ? m.descripcion : '',
      // Solo un gasto puede ser abono, y la deuda tiene que existir
      deudaId: m.tipo === 'gasto' && deudas.some((d) => d.id === m.deudaId) ? m.deudaId : null,
    };
  });

  // Solo se conservan presupuestos válidos de categorías de gasto que existan
  const presupuestos = Object.fromEntries(
    Object.entries(datos.presupuestos ?? {})
      .filter(([id, monto]) => existeCategoria(id, 'gasto') && Number.isSafeInteger(monto) && monto > 0),
  );

  return {
    cuentas,
    categorias,
    movimientos,
    presupuestos,
    deudas,
    esEjemplo: datos.esEjemplo === true,
    metodosPagoAgregados: true,
  };
}

// ---------------------------------------------------------
// Guardar y cargar en el navegador (localStorage)
// ---------------------------------------------------------
function cargar() {
  let texto = null;
  try {
    texto = localStorage.getItem(CLAVE_GUARDADO);
    if (texto === null) return estadoInicial(); // primera vez que se abre
    return normalizarDatos(JSON.parse(texto));
  } catch (error) {
    // Si lo guardado está dañado se conserva una copia antes de empezar de cero
    try {
      if (texto !== null) localStorage.setItem(`${CLAVE_GUARDADO}-danado`, texto);
    } catch { /* si tampoco se puede guardar, no hay nada más que hacer */ }
    console.error('No se pudieron leer los datos guardados:', error);
    return estadoInicial();
  }
}

// Devuelve true si se guardó bien (app.js avisa si falla)
function guardar() {
  try {
    localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(estado));
    return true;
  } catch (error) {
    console.error('No se pudo guardar:', error);
    return false;
  }
}

// Toda la información de la app vive en esta variable
let estado = cargar();

// ---------------------------------------------------------
// Búsquedas sencillas
// ---------------------------------------------------------
function buscarCuenta(id) {
  return estado.cuentas.find((c) => c.id === id);
}

function buscarCategoria(id) {
  return estado.categorias.find((c) => c.id === id);
}

function categoriasDe(tipo) {
  return estado.categorias.filter((c) => c.tipo === tipo);
}

// ---------------------------------------------------------
// Cálculos
// ---------------------------------------------------------

// El saldo de una cuenta es su saldo inicial más todo lo que entró
// menos todo lo que salió.
function saldoCuenta(id) {
  const cuenta = buscarCuenta(id);
  let saldo = cuenta.saldoInicial;

  for (const m of estado.movimientos) {
    if (m.tipo === 'ingreso' && m.cuentaId === id) saldo += m.monto;
    if (m.tipo === 'gasto' && m.cuentaId === id) saldo -= m.monto;
    if (m.tipo === 'transferencia') {
      if (m.cuentaId === id) saldo -= m.monto;
      if (m.cuentaDestinoId === id) saldo += m.monto;
    }
  }
  return saldo;
}

function saldoTotal() {
  return estado.cuentas.reduce((suma, c) => suma + saldoCuenta(c.id), 0);
}

// Movimientos de un mes, del más reciente al más antiguo.
// El reverse() deja de primero lo último que se agregó dentro de un mismo día.
function movimientosDelMes(mes) {
  return estado.movimientos
    .filter((m) => mesDe(m.fecha) === mes)
    .reverse()
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Las transferencias no cuentan: el dinero solo cambia de bolsillo.
function totalesDelMes(mes) {
  let ingresos = 0;
  let gastos = 0;
  for (const m of estado.movimientos) {
    if (mesDe(m.fecha) !== mes) continue;
    if (m.tipo === 'ingreso') ingresos += m.monto;
    if (m.tipo === 'gasto') gastos += m.monto;
  }
  return { ingresos, gastos, balance: ingresos - gastos };
}

// Cuánto se gastó en cada categoría, de mayor a menor
function gastosPorCategoria(mes) {
  const totales = new Map();
  for (const m of estado.movimientos) {
    if (m.tipo !== 'gasto' || mesDe(m.fecha) !== mes) continue;
    totales.set(m.categoriaId, (totales.get(m.categoriaId) ?? 0) + m.monto);
  }
  return [...totales]
    .map(([id, total]) => ({ id, nombre: buscarCategoria(id).nombre, total }))
    .sort((a, b) => b.total - a.total);
}

// Totales de varios meses seguidos que terminan en el mes indicado
function ultimosMeses(mes, cantidad) {
  const lista = [];
  for (let i = cantidad - 1; i >= 0; i--) {
    const m = sumarMeses(mes, -i);
    lista.push({ mes: m, ...totalesDelMes(m) });
  }
  return lista;
}

// ---------------------------------------------------------
// Deudas
// Un abono es un gasto normal que tiene el campo deudaId.
// Así el abono baja el saldo de la cuenta y también la deuda,
// y si se edita o se borra en Movimientos, la deuda se actualiza sola.
// ---------------------------------------------------------
function buscarDeuda(id) {
  return estado.deudas.find((d) => d.id === id);
}

// Abonos de una deuda, del más reciente al más antiguo
function abonosDe(id) {
  return estado.movimientos
    .filter((m) => m.deudaId === id)
    .reverse()
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function pagadoDeuda(id) {
  return abonosDe(id).reduce((suma, m) => suma + m.monto, 0);
}

function pendienteDeuda(deuda) {
  return deuda.monto - pagadoDeuda(deuda.id);
}

// Lo que se debe en total, o solo a 'persona' o a 'entidad'
function totalDeudas(tipoAcreedor) {
  return estado.deudas
    .filter((d) => !tipoAcreedor || d.tipoAcreedor === tipoAcreedor)
    .reduce((suma, d) => suma + pendienteDeuda(d), 0);
}

// Días que faltan para una fecha (negativo si ya pasó)
function diasHasta(fecha) {
  const enDias = (texto) => {
    const [anio, mes, dia] = texto.split('-').map(Number);
    return Date.UTC(anio, mes - 1, dia) / 86400000;
  };
  return enDias(fecha) - enDias(hoy());
}

// '2026-12-15' -> '15 de dic de 2026'
function fechaConAnio(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia)
    .toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace('.', '');
}

// ---------------------------------------------------------
// Datos de ejemplo, para ver cómo se ve la app llena
// ---------------------------------------------------------
function cargarEjemplo() {
  const nuevo = estadoInicial();
  nuevo.esEjemplo = true;
  nuevo.cuentas = [
    { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 200000 },
    { id: 'banco', nombre: 'Cuenta de ahorros', tipo: 'banco', saldoInicial: 1500000 },
    { id: 'billetera', nombre: 'Billetera digital', tipo: 'billetera', saldoInicial: 150000 },
  ];
  nuevo.presupuestos = {
    'gasto-1': 800000, 'gasto-2': 850000, 'gasto-3': 250000, 'gasto-4': 200000, 'gasto-8': 150000,
  };

  // Cada fila: tipo, categoría, cuenta, día del mes, monto, descripción
  const plantilla = [
    ['ingreso', 'ingreso-1', 'banco', 1, 3200000, 'Pago de nómina'],
    ['gasto', 'gasto-2', 'banco', 2, 850000, 'Arriendo'],
    ['gasto', 'gasto-1', 'banco', 4, 310000, 'Mercado grande'],
    ['gasto', 'gasto-3', 'billetera', 6, 180000, 'Luz, agua y gas'],
    ['gasto', 'gasto-4', 'billetera', 7, 95000, 'Pasajes de la semana'],
    ['gasto', 'gasto-8', 'efectivo', 8, 70000, 'Salida con amigos'],
    ['gasto', 'gasto-1', 'efectivo', 15, 240000, 'Mercado de quincena'],
    ['ingreso', 'ingreso-2', 'billetera', 20, 450000, 'Venta del negocio'],
    ['gasto', 'gasto-5', 'banco', 22, 60000, 'Droguería'],
    ['gasto', 'gasto-1', 'banco', 26, 190000, 'Mercado'],
  ];
  // Variación por mes, para que no todos los meses sean iguales
  const variacion = [0.92, 1.05, 0.98, 1.12, 0.95, 1];
  const fechaHoy = hoy();

  variacion.forEach((factor, i) => {
    const mes = sumarMeses(mesDe(fechaHoy), i - (variacion.length - 1));
    for (const [tipo, categoriaId, cuentaId, dia, monto, descripcion] of plantilla) {
      const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
      if (fecha > fechaHoy) continue; // no se inventan movimientos futuros

      // Los valores fijos (salario y arriendo) no cambian de un mes a otro
      const esFijo = categoriaId === 'ingreso-1' || categoriaId === 'gasto-2';
      nuevo.movimientos.push({
        id: crearId(),
        tipo,
        monto: esFijo ? monto : Math.round(monto * factor / 1000) * 1000,
        fecha,
        cuentaId,
        cuentaDestinoId: null,
        categoriaId,
        descripcion,
        deudaId: null,
      });
    }
  });

  // Una deuda con una entidad (con un abono) y otra con una persona
  nuevo.deudas = [
    { id: 'deuda-banco', acreedor: 'Crédito de libre inversión', tipoAcreedor: 'entidad', monto: 4500000, vencimiento: '', nota: 'Cuotas mensuales' },
    { id: 'deuda-persona', acreedor: 'Prima Claudia', tipoAcreedor: 'persona', monto: 300000, vencimiento: `${sumarMeses(mesDe(fechaHoy), 1)}-15`, nota: '' },
  ];
  nuevo.movimientos.push({
    id: crearId(),
    tipo: 'gasto',
    monto: 350000,
    fecha: `${mesDe(fechaHoy)}-01`,
    cuentaId: 'banco',
    cuentaDestinoId: null,
    categoriaId: 'gasto-9',
    descripcion: 'Abono a Crédito de libre inversión',
    deudaId: 'deuda-banco',
  });

  return nuevo;
}
