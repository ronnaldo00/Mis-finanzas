// =========================================================
// asistente.js: el chat con Claude (inteligencia artificial).
// Le cuentas tus deudas y movimientos con tus palabras y Claude
// los anota en la app, o te explica cómo van tus cuentas.
//
// Cómo funciona, en corto:
// 1. Tu mensaje se manda a Claude junto con una lista de "herramientas"
//    (funciones de esta app que Claude puede pedir que se ejecuten).
// 2. Claude responde con texto o pidiendo usar una herramienta, por
//    ejemplo "anotar_movimiento". Esta app la ejecuta aquí mismo, en
//    tu celular, y le devuelve el resultado.
// 3. Se repite hasta que Claude termina de responder.
// Tus datos nunca se suben a ningún servidor de la app: solo viajan a
// Claude los que él pide para responderte.
// =========================================================

// La clave de la API se guarda aparte de tus datos financieros,
// así no termina dentro de un respaldo que compartas.
const CLAVE_IA = 'mis-lukas-clave-ia';

// Librería oficial de Anthropic (la empresa de Claude), traída desde internet.
// La versión va fija para que una actualización no cambie la app sin avisar.
const URL_LIBRERIA_CLAUDE = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.5.0/+esm';
const MODELO = 'claude-opus-5-5';

// Cuántas vueltas (pedir herramienta -> responder) se permiten por mensaje.
// Evita que una conversación se quede dando vueltas gastando saldo.
const MAX_VUELTAS = 12;

// Lo que pasa en el chat mientras la app está abierta (no se guarda).
const chat = {
  mensajes: [],  // la conversación tal cual se le manda a Claude
  burbujas: [],  // lo que se ve en pantalla: { rol: 'yo' | 'ia' | 'nota' | 'error', texto }
  ocupado: false,
};

function leerClaveIA() {
  try { return localStorage.getItem(CLAVE_IA) ?? ''; } catch { return ''; }
}
function guardarClaveIA(clave) {
  try {
    if (clave) localStorage.setItem(CLAVE_IA, clave);
    else localStorage.removeItem(CLAVE_IA);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------
// Instrucciones para Claude (no cambian, así se aprovecha el
// "caché" de la API y cada mensaje sale más barato)
// ---------------------------------------------------------
const INSTRUCCIONES = `Eres el asistente de "Mis Lukas", una app personal para llevar cuentas, gastos, presupuestos y deudas en pesos colombianos. Hablas con el dueño de la app, en español de Colombia, con un tono cercano y claro.

Lo que haces:
- Anotar movimientos (gastos, ingresos, transferencias entre cuentas), deudas nuevas y abonos a deudas cuando el usuario te los cuenta.
- Explicar cómo van sus finanzas: en qué se le va la plata, cuánto debe, cuánto ha abonado, qué deuda le conviene pagar primero, cómo va frente al presupuesto.

Cómo trabajar:
- Antes de anotar o de responder sobre sus datos, usa consultar_finanzas para conocer la fecha de hoy, las cuentas, categorías y deudas con sus identificadores. Nunca inventes datos ni identificadores.
- Los montos son pesos enteros. En Colombia "una luka" o "mil" = 1.000; "20 lukas" = 20.000; "un palo" o "un millón" = 1.000.000; "medio palo" = 500.000.
- Si no dicen la fecha, usa la de hoy. "Ayer" es el día anterior a hoy.
- Escoge la cuenta y la categoría que mejor encajen con lo que cuenta el usuario (por ejemplo, "pagué con Nequi" es la cuenta Nequi; "almuerzo" es comida). Si de verdad no se puede saber de qué cuenta salió la plata, pregunta antes de anotar.
- Una deuda es dinero que el usuario le debe a una persona o a una entidad (banco, tienda, cooperativa). Cuando abona a una deuda, usa abonar_deuda: así el abono baja la deuda y también el saldo de la cuenta. No lo anotes además como gasto aparte.
- Si el usuario cuenta varias cosas en un mismo mensaje, anótalas todas.
- Después de anotar, confirma en una o dos frases qué quedó guardado (monto, cuenta, fecha). Si algo falló, dilo y explica por qué.
- No puedes borrar ni editar lo que ya está anotado: si el usuario lo pide, dile que lo haga desde la pantalla Movimientos o Deudas de la app.

Formato de tus respuestas: se leen en la pantalla de un celular. Sé breve, escribe montos como $ 20.000, usa listas cortas con "- " cuando ayuden, y **negrilla** solo para lo más importante. No uses tablas ni títulos.`;

// ---------------------------------------------------------
// Herramientas que Claude puede usar.
// "strict: true" obliga a Claude a mandar los datos exactamente
// con la forma que se describe aquí.
// ---------------------------------------------------------
const texto = (descripcion) => ({ type: 'string', description: descripcion });
const textoONulo = (descripcion) => ({ type: ['string', 'null'], description: descripcion });
const pesosEnteros = (descripcion) => ({ type: 'integer', description: descripcion });

const HERRAMIENTAS = [
  {
    name: 'consultar_finanzas',
    description: 'Devuelve la fecha de hoy, las cuentas con su saldo, las categorías, las deudas con lo pagado y lo pendiente, y los totales y presupuestos del mes actual. Úsala antes de anotar algo o de responder sobre los datos.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'ver_movimientos',
    description: 'Lista los movimientos de un mes (gastos, ingresos, transferencias y abonos), del más reciente al más antiguo.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { mes: texto('Mes en formato AAAA-MM, por ejemplo 2026-11.') },
      required: ['mes'],
      additionalProperties: false,
    },
  },
  {
    name: 'anotar_movimiento',
    description: 'Anota un gasto, un ingreso o una transferencia entre dos cuentas del usuario. Para abonos a deudas usa abonar_deuda.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['gasto', 'ingreso', 'transferencia'] },
        monto: pesosEnteros('Valor en pesos, entero y mayor que cero.'),
        fecha: texto('Fecha AAAA-MM-DD.'),
        cuentaId: texto('Id de la cuenta de donde sale (gasto, transferencia) o a donde entra (ingreso) la plata.'),
        categoriaId: textoONulo('Id de una categoría del mismo tipo (gasto o ingreso). null en transferencias.'),
        cuentaDestinoId: textoONulo('Solo en transferencias: id de la cuenta que recibe. null en los demás casos.'),
        descripcion: texto('Descripción corta, por ejemplo "Almuerzo con Juan".'),
      },
      required: ['tipo', 'monto', 'fecha', 'cuentaId', 'categoriaId', 'cuentaDestinoId', 'descripcion'],
      additionalProperties: false,
    },
  },
  {
    name: 'anotar_deuda',
    description: 'Anota una deuda nueva: dinero que el usuario le debe a una persona o a una entidad.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        acreedor: texto('A quién se le debe, por ejemplo "Mi tía Rosa" o "Tarjeta Éxito".'),
        tipoAcreedor: { type: 'string', enum: ['persona', 'entidad'] },
        monto: pesosEnteros('Total que se debe, en pesos, entero y mayor que cero.'),
        vencimiento: texto('Fecha límite AAAA-MM-DD, o texto vacío "" si no tiene.'),
        nota: texto('Detalle opcional (cuotas, interés, motivo). Texto vacío "" si no hay.'),
      },
      required: ['acreedor', 'tipoAcreedor', 'monto', 'vencimiento', 'nota'],
      additionalProperties: false,
    },
  },
  {
    name: 'abonar_deuda',
    description: 'Registra un abono (pago) a una deuda que ya existe. Baja lo pendiente de la deuda y el saldo de la cuenta.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        deudaId: texto('Id de la deuda.'),
        monto: pesosEnteros('Valor del abono en pesos, entero y mayor que cero.'),
        cuentaId: texto('Id de la cuenta de donde sale la plata.'),
        fecha: texto('Fecha AAAA-MM-DD.'),
      },
      required: ['deudaId', 'monto', 'cuentaId', 'fecha'],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------
// Lo que hace cada herramienta.
// Cada función devuelve un objeto que se le manda a Claude.
// Si algo está mal, se lanza un Error con la explicación:
// Claude la recibe y se la cuenta al usuario.
// ---------------------------------------------------------
const esFecha = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
const esMontoValido = (valor) => Number.isSafeInteger(valor) && valor > 0;

// Revisa lo que llegó de Claude antes de tocar los datos
function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function nombreCuenta(id) { return buscarCuenta(id)?.nombre ?? id; }

const EJECUTAR = {
  consultar_finanzas() {
    const mes = mesDe(hoy());
    return {
      hoy: hoy(),
      sonDatosDeEjemplo: estado.esEjemplo,
      cuentas: estado.cuentas.map((c) => ({
        id: c.id, nombre: c.nombre, tipo: TIPOS_CUENTA[c.tipo], saldo: saldoCuenta(c.id),
      })),
      saldoTotal: saldoTotal(),
      categorias: estado.categorias.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
      deudas: estado.deudas.map((d) => ({
        id: d.id,
        acreedor: d.acreedor,
        tipoAcreedor: d.tipoAcreedor,
        montoTotal: d.monto,
        pagado: pagadoDeuda(d.id),
        pendiente: pendienteDeuda(d),
        vencimiento: d.vencimiento || null,
        nota: d.nota,
      })),
      totalDeudasPendiente: totalDeudas(),
      mesActual: {
        mes,
        ...totalesDelMes(mes),
        gastosPorCategoria: gastosPorCategoria(mes).map((g) => ({
          categoria: g.nombre,
          gastado: g.total,
          presupuesto: estado.presupuestos[g.id] ?? null,
        })),
      },
      presupuestos: Object.entries(estado.presupuestos).map(([id, monto]) => ({
        categoria: buscarCategoria(id)?.nombre ?? id, monto,
      })),
    };
  },

  ver_movimientos({ mes }) {
    exigir(/^\d{4}-\d{2}$/.test(mes), 'El mes debe tener el formato AAAA-MM.');
    return {
      mes,
      totales: totalesDelMes(mes),
      movimientos: movimientosDelMes(mes).map((m) => ({
        fecha: m.fecha,
        tipo: m.deudaId ? 'abono a deuda' : m.tipo,
        monto: m.monto,
        cuenta: nombreCuenta(m.cuentaId),
        cuentaDestino: m.cuentaDestinoId ? nombreCuenta(m.cuentaDestinoId) : null,
        categoria: m.categoriaId ? buscarCategoria(m.categoriaId)?.nombre : null,
        deuda: m.deudaId ? buscarDeuda(m.deudaId)?.acreedor : null,
        descripcion: m.descripcion,
      })),
    };
  },

  anotar_movimiento(e) {
    exigir(['gasto', 'ingreso', 'transferencia'].includes(e.tipo), 'Tipo de movimiento desconocido.');
    exigir(esMontoValido(e.monto), 'El monto debe ser un número entero mayor que cero.');
    exigir(esFecha(e.fecha), 'La fecha debe tener el formato AAAA-MM-DD.');
    exigir(buscarCuenta(e.cuentaId), `No existe una cuenta con id "${e.cuentaId}".`);

    const esTransferencia = e.tipo === 'transferencia';
    if (esTransferencia) {
      exigir(buscarCuenta(e.cuentaDestinoId), 'Falta una cuenta destino válida para la transferencia.');
      exigir(e.cuentaDestinoId !== e.cuentaId, 'La cuenta de origen y la de destino no pueden ser la misma.');
    } else {
      const categoria = buscarCategoria(e.categoriaId);
      exigir(categoria && categoria.tipo === e.tipo, `No existe una categoría de ${e.tipo} con id "${e.categoriaId}".`);
    }

    estado.movimientos.push({
      id: crearId(),
      tipo: e.tipo,
      monto: e.monto,
      fecha: e.fecha,
      cuentaId: e.cuentaId,
      cuentaDestinoId: esTransferencia ? e.cuentaDestinoId : null,
      categoriaId: esTransferencia ? null : e.categoriaId,
      descripcion: String(e.descripcion ?? '').slice(0, 120),
      deudaId: null,
    });
    exigir(guardar(), 'No se pudo guardar en el navegador.');

    const detalle = esTransferencia
      ? `de ${nombreCuenta(e.cuentaId)} a ${nombreCuenta(e.cuentaDestinoId)}`
      : `en ${buscarCategoria(e.categoriaId).nombre}, ${nombreCuenta(e.cuentaId)}`;
    const nombres = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' };
    agregarNota(`${nombres[e.tipo]} de ${pesos(e.monto)} ${detalle} (${fechaCorta(e.fecha)})`);
    return { guardado: true, nuevoSaldoCuenta: saldoCuenta(e.cuentaId) };
  },

  anotar_deuda(e) {
    const acreedor = String(e.acreedor ?? '').trim().slice(0, 60);
    exigir(acreedor, 'Falta a quién se le debe.');
    exigir(['persona', 'entidad'].includes(e.tipoAcreedor), 'El acreedor debe ser "persona" o "entidad".');
    exigir(esMontoValido(e.monto), 'El monto debe ser un número entero mayor que cero.');
    exigir(e.vencimiento === '' || esFecha(e.vencimiento), 'El vencimiento debe ser AAAA-MM-DD o vacío.');

    const deuda = {
      id: crearId(),
      acreedor,
      tipoAcreedor: e.tipoAcreedor,
      monto: e.monto,
      vencimiento: e.vencimiento,
      nota: String(e.nota ?? '').trim().slice(0, 200),
    };
    estado.deudas.push(deuda);
    exigir(guardar(), 'No se pudo guardar en el navegador.');

    agregarNota(`Deuda con ${acreedor} por ${pesos(e.monto)}`);
    return { guardado: true, deudaId: deuda.id };
  },

  abonar_deuda(e) {
    const deuda = buscarDeuda(e.deudaId);
    exigir(deuda, `No existe una deuda con id "${e.deudaId}".`);
    exigir(esMontoValido(e.monto), 'El monto debe ser un número entero mayor que cero.');
    exigir(esFecha(e.fecha), 'La fecha debe tener el formato AAAA-MM-DD.');
    exigir(buscarCuenta(e.cuentaId), `No existe una cuenta con id "${e.cuentaId}".`);
    const pendiente = pendienteDeuda(deuda);
    exigir(e.monto <= pendiente, `El abono supera lo que se debe (${pesos(pendiente)}).`);

    // Igual que en el formulario de abono: se usa la categoría "Deudas" si existe
    const gastos = categoriasDe('gasto');
    const categoria = gastos.find((c) => c.nombre.toLowerCase() === 'deudas') ?? gastos[0];

    estado.movimientos.push({
      id: crearId(),
      tipo: 'gasto',
      monto: e.monto,
      fecha: e.fecha,
      cuentaId: e.cuentaId,
      cuentaDestinoId: null,
      categoriaId: categoria.id,
      descripcion: `Abono a ${deuda.acreedor}`,
      deudaId: deuda.id,
    });
    exigir(guardar(), 'No se pudo guardar en el navegador.');

    agregarNota(`Abono de ${pesos(e.monto)} a ${deuda.acreedor} desde ${nombreCuenta(e.cuentaId)}`);
    return { guardado: true, pendienteDespues: pendienteDeuda(deuda) };
  },
};

// Ejecuta la herramienta que pidió Claude y arma la respuesta para él
function usarHerramienta(bloque) {
  try {
    const funcion = EJECUTAR[bloque.name];
    if (!funcion) throw new Error(`Herramienta desconocida: ${bloque.name}`);
    const resultado = funcion(bloque.input ?? {});
    return { type: 'tool_result', tool_use_id: bloque.id, content: JSON.stringify(resultado) };
  } catch (error) {
    // is_error le avisa a Claude que no se pudo, para que lo explique o lo corrija
    return { type: 'tool_result', tool_use_id: bloque.id, content: error.message, is_error: true };
  }
}

// ---------------------------------------------------------
// Hablar con Claude
// ---------------------------------------------------------
let libreriaClaude = null;
async function cargarLibreria() {
  // import() trae la librería solo la primera vez que se usa el chat
  libreriaClaude ??= await import(URL_LIBRERIA_CLAUDE);
  return libreriaClaude;
}

// Convierte un error en un mensaje entendible
function explicarError(error, lib) {
  if (lib && error instanceof lib.AuthenticationError) {
    return 'La clave de la API no es válida. Revísala en "Cambiar clave".';
  }
  if (lib && error instanceof lib.PermissionDeniedError) {
    return 'Esa clave no tiene permiso para usar Claude.';
  }
  if (lib && error instanceof lib.RateLimitError) {
    return 'Mandaste muchos mensajes seguidos. Espera un minuto y vuelve a intentar.';
  }
  if (lib && error instanceof lib.BadRequestError && /credit balance/i.test(error.message)) {
    return 'Tu cuenta de Anthropic no tiene saldo. Recárgala en console.anthropic.com (Billing).';
  }
  if (lib && error instanceof lib.APIConnectionError) {
    return 'No hay conexión a internet o no se pudo llegar a Claude.';
  }
  if (lib && error instanceof lib.APIError && error.status >= 500) {
    return 'Claude está muy ocupado en este momento. Intenta de nuevo en un rato.';
  }
  if (!lib) return 'No se pudo cargar el chat. Revisa tu conexión a internet.';
  return `Algo salió mal: ${error.message}`;
}

async function conversar(textoUsuario) {
  const clave = leerClaveIA();
  // Si algo falla, la conversación vuelve a como estaba antes de este mensaje
  const largoAntes = chat.mensajes.length;
  chat.ocupado = true;
  chat.burbujas.push({ rol: 'yo', texto: textoUsuario });
  chat.mensajes.push({ role: 'user', content: textoUsuario });
  dibujarChat();

  let lib = null;
  try {
    lib = await cargarLibreria();
    // dangerouslyAllowBrowser: la librería pide confirmar que se usa desde
    // el navegador, porque la clave queda guardada en este dispositivo.
    const cliente = new lib.default({ apiKey: clave, dangerouslyAllowBrowser: true });

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const respuesta = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        system: INSTRUCCIONES,
        tools: HERRAMIENTAS,
        messages: chat.mensajes,
        // "low" = respuestas rápidas y baratas, suficiente para un chat
        output_config: { effort: 'low' },
        // Guarda en caché las instrucciones y la conversación: cada mensaje cuesta menos
        cache_control: { type: 'ephemeral' },
        // Si un filtro de seguridad rechaza la pregunta por error, otro modelo responde
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });

      // La respuesta completa se guarda tal cual (incluye el "pensamiento" de Claude,
      // que la API necesita de vuelta para seguir la conversación)
      chat.mensajes.push({ role: 'assistant', content: respuesta.content });

      const textoIA = respuesta.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (textoIA) chat.burbujas.push({ rol: 'ia', texto: textoIA });

      if (respuesta.stop_reason === 'refusal') {
        chat.burbujas.push({ rol: 'error', texto: 'Claude no quiso responder esa pregunta. Prueba diciéndolo de otra forma.' });
        break;
      }
      if (respuesta.stop_reason === 'max_tokens') {
        chat.burbujas.push({ rol: 'error', texto: 'La respuesta quedó cortada por ser muy larga.' });
        break;
      }
      // pause_turn: Claude necesita más tiempo; se le manda lo mismo para que siga
      if (respuesta.stop_reason === 'pause_turn') continue;
      if (respuesta.stop_reason !== 'tool_use') break;

      // Claude pidió usar herramientas: se ejecutan todas y los resultados
      // se le devuelven juntos en un solo mensaje
      const pedidos = respuesta.content.filter((b) => b.type === 'tool_use');
      chat.mensajes.push({ role: 'user', content: pedidos.map(usarHerramienta) });
      dibujarChat();
    }
  } catch (error) {
    console.error('Error del asistente:', error);
    chat.mensajes.length = largoAntes;
    chat.burbujas.push({ rol: 'error', texto: explicarError(error, lib) });
  } finally {
    chat.ocupado = false;
    dibujarChat();
  }
}

// ---------------------------------------------------------
// Pantalla: Asistente
// ---------------------------------------------------------

// Mensajito verde que confirma lo que Claude anotó
function agregarNota(textoNota) {
  chat.burbujas.push({ rol: 'nota', texto: textoNota });
}

// Convierte el poquito de formato que usa Claude (**negrilla** y listas con "- ")
// en HTML. Primero se escapa todo con esc() para que no se cuele código.
function formatoChat(textoCrudo) {
  return esc(textoCrudo)
    .split('\n')
    .map((linea) => linea.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'))
    .map((linea) => (/^\s*[-•*] /.test(linea) ? `<span class="chat-punto">${linea.replace(/^\s*[-•*] /, '')}</span>` : linea))
    .join('<br>')
    .replace(/<br>(<span class="chat-punto">)/g, '$1')
    .replace(/(<\/span>)<br>/g, '$1');
}

// ---------------------------------------------------------
// Estilo terminal de Linux: cada mensaje es una línea de la consola.
// ---------------------------------------------------------

// El "prompt", lo que sale antes de lo que escribes, como en la terminal
const PROMPT = 'ronald@mis-lukas:~$';

// Texto de bienvenida al abrir la terminal (o después de "clear")
const BIENVENIDA = `
  <div class="t-linea t-tenue">Mis Lukas · asistente con Claude (${MODELO})</div>
  <div class="t-linea t-tenue">Cuéntame tus gastos, ingresos y deudas como se los contarías a un amigo.</div>
  <div class="t-linea t-tenue">Escribe <span class="t-comando">ayuda</span> para ver ejemplos o <span class="t-comando">clear</span> para limpiar.</div>
  <div class="t-linea">&nbsp;</div>`;

// Lo que muestra el comando "ayuda" (no gasta saldo: no se le manda a Claude)
const AYUDA = `Ejemplos de lo que puedes escribir:
- hoy gasté 18 lukas en almuerzo, pagué con Nequi
- me pagaron el sueldo, 2 palos a Lulo Bank
- le debo 300 mil a mi primo Andrés, le pago el 15 de diciembre
- abona 50 mil a la deuda de Andrés desde efectivo
- ¿en qué se me fue la plata este mes?
- ¿qué deuda me conviene pagar primero?
Comandos: ayuda · clear (limpia la pantalla) · clave (cambia la clave de la API)`;

function htmlBurbujas() {
  const lineas = chat.burbujas.map((b) => {
    if (b.rol === 'yo') {
      return `<div class="t-linea"><span class="t-prompt">${PROMPT}</span> ${formatoChat(b.texto)}</div>`;
    }
    if (b.rol === 'nota') {
      return `<div class="t-linea t-ok">[  <span>OK</span>  ] Anotado: ${formatoChat(b.texto)}</div>`;
    }
    if (b.rol === 'error') {
      return `<div class="t-linea t-error">[<span>ERROR</span>] ${formatoChat(b.texto)}</div>`;
    }
    // Respuesta de Claude (o del comando ayuda)
    return `<div class="t-linea t-ia"><span class="t-claude">claude&gt;</span> ${formatoChat(b.texto)}</div>`;
  }).join('');

  // Mientras Claude responde se ve un "cargando" con la rayita que gira
  const pensando = !chat.ocupado ? '' : `
    <div class="t-linea t-tenue" aria-label="Claude está pensando"><span class="t-girando"></span> claude está pensando...</div>`;

  return BIENVENIDA + lineas + pensando;
}

// Barra de arriba con los tres botoncitos de colores, como una ventana de Linux
function barraTerminal(titulo, conBotones) {
  return `
    <div class="t-barra">
      <span class="t-puntos" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="t-titulo">${titulo}</span>
      ${conBotones ? `
        <span class="t-acciones">
          <button type="button" data-accion="nueva-conversacion" title="Limpiar la pantalla">clear</button>
          <button type="button" data-accion="cambiar-clave-ia" title="Cambiar la clave de la API">clave</button>
        </span>` : ''}
    </div>`;
}

function vistaAsistente() {
  if (!leerClaveIA()) {
    return `
      <section class="terminal">
        ${barraTerminal('ronald@mis-lukas: ~/configurar', false)}
        <div class="t-pantalla t-pantalla-corta">
          <div class="t-linea"><span class="t-prompt">${PROMPT}</span> mis-lukas --conectar-claude</div>
          <div class="t-linea t-tenue">El asistente usa la API de Claude, que se paga aparte de tu plan de Claude (unos pocos pesos por mensaje).</div>
          <div class="t-linea t-tenue">1. Entra a <span class="t-comando">console.anthropic.com</span> y crea una clave en API Keys.</div>
          <div class="t-linea t-tenue">2. Recarga saldo en Billing.</div>
          <div class="t-linea t-tenue">3. Pega la clave aquí abajo y presiona Enter.</div>
          <div class="t-linea t-tenue">La clave se queda solo en este dispositivo y no va en los respaldos.</div>
          <div class="t-linea">&nbsp;</div>
          <form data-form="clave-ia" class="t-entrada">
            <label for="clave-ia" class="t-prompt">clave:</label>
            <input id="clave-ia" name="clave" type="password" autocomplete="off" placeholder="sk-ant-..." required>
            <button type="submit" class="t-enter" aria-label="Guardar clave">⏎</button>
            <p class="error t-error" role="alert"></p>
          </form>
        </div>
      </section>`;
  }

  return `
    <section class="terminal">
      ${barraTerminal('ronald@mis-lukas: ~/asistente', true)}
      <div class="t-pantalla" id="chat-lista" aria-live="polite">${htmlBurbujas()}</div>
      <form class="t-entrada t-entrada-chat" data-form="chat">
        <label for="chat-mensaje" class="t-prompt">${PROMPT}</label>
        <textarea name="mensaje" id="chat-mensaje" rows="1" maxlength="2000"
          placeholder="escribe aquí..." autocomplete="off" autocapitalize="off" spellcheck="false"
          ${chat.ocupado ? 'disabled' : ''}></textarea>
        <button type="submit" class="t-enter" aria-label="Enviar" ${chat.ocupado ? 'disabled' : ''}>⏎</button>
      </form>
    </section>`;
}

// Redibuja solo el chat (no toda la pantalla), para no perder lo que se está escribiendo
function dibujarChat() {
  const lista = document.getElementById('chat-lista');
  if (!lista) return;
  lista.innerHTML = htmlBurbujas();
  lista.scrollTop = lista.scrollHeight;

  const campo = document.getElementById('chat-mensaje');
  const boton = document.querySelector('.t-entrada-chat .t-enter');
  campo.disabled = chat.ocupado;
  boton.disabled = chat.ocupado;
  if (!chat.ocupado && matchMedia('(hover: hover)').matches) campo.focus();
}

// La cajita de texto crece hacia abajo a medida que escribes, hasta 6 renglones
function ajustarAltoEntrada(campo) {
  campo.style.height = 'auto';
  campo.style.height = `${Math.min(campo.scrollHeight, 6 * 22)}px`;
}

// ---------------------------------------------------------
// Se conecta con app.js: formularios y botones de esta pantalla
// ---------------------------------------------------------
GUARDAR_FORMULARIO['clave-ia'] = (form, datos) => {
  const clave = datos.get('clave').trim();
  if (!clave.startsWith('sk-ant-')) return 'La clave debe empezar por "sk-ant-".';
  if (!guardarClaveIA(clave)) return 'Este navegador no deja guardar la clave.';
  avisar('Clave guardada');
  dibujar();
  return null;
};

GUARDAR_FORMULARIO.chat = (form, datos) => {
  const mensaje = datos.get('mensaje').trim();
  if (!mensaje || chat.ocupado) return null;
  form.reset();
  ajustarAltoEntrada(form.elements.mensaje);

  // Comandos de la terminal: se resuelven aquí mismo, sin gastar saldo
  const comando = mensaje.toLowerCase();
  if (comando === 'clear' || comando === 'limpiar') {
    ACCIONES['nueva-conversacion']();
    return null;
  }
  if (comando === 'clave') {
    ACCIONES['cambiar-clave-ia']();
    return null;
  }
  if (comando === 'ayuda' || comando === 'help') {
    chat.burbujas.push({ rol: 'yo', texto: mensaje }, { rol: 'ia', texto: AYUDA });
    dibujarChat();
    return null;
  }

  conversar(mensaje);
  return null;
};

ACCIONES['nueva-conversacion'] = () => {
  if (chat.ocupado) return;
  chat.mensajes = [];
  chat.burbujas = [];
  dibujarChat();
};

ACCIONES['cambiar-clave-ia'] = () => {
  if (!confirm('¿Quitar la clave guardada para poner otra?')) return;
  guardarClaveIA('');
  dibujar();
};

// Como en la terminal, Enter envía. Shift+Enter hace un salto de línea.
document.addEventListener('keydown', (evento) => {
  if (evento.target.id !== 'chat-mensaje' || evento.key !== 'Enter' || evento.shiftKey) return;
  evento.preventDefault();
  evento.target.form.requestSubmit();
});

document.addEventListener('input', (evento) => {
  if (evento.target.id === 'chat-mensaje') ajustarAltoEntrada(evento.target);
});

// Tocar cualquier parte de la terminal pone el cursor para escribir
document.addEventListener('click', (evento) => {
  if (!evento.target.closest('#chat-lista') || getSelection().toString()) return;
  document.getElementById('chat-mensaje')?.focus();
});
