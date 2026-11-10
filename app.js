// =========================================================
// app.js: dibuja las pantallas y responde a los clics.
// =========================================================

// Lo que se está viendo en este momento (esto no se guarda)
const ui = {
  vista: 'inicio',
  mes: mesDe(hoy()),
  filtro: { texto: '', tipo: '', categoriaId: '' },
};

const TITULOS = {
  inicio: 'Inicio',
  movimientos: 'Movimientos',
  presupuestos: 'Presupuesto',
  deudas: 'Deudas',
  cuentas: 'Cuentas',
  ajustes: 'Ajustes',
};

// Estas pantallas no dependen de un mes, así que se oculta el selector
const VISTAS_SIN_MES = ['deudas', 'cuentas', 'ajustes'];

const contenido = document.getElementById('contenido');
const dialogo = document.getElementById('dialogo');

// ---------------------------------------------------------
// Utilidades
// ---------------------------------------------------------

// Muestra un mensaje corto abajo durante 3 segundos
let temporizadorAviso;
function avisar(mensaje) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = mensaje;
  aviso.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), 3000);
}

// Guarda, avisa y vuelve a dibujar. Se llama después de cada cambio.
function guardarYDibujar(mensaje) {
  if (guardar()) avisar(mensaje);
  else avisar('¡Ojo! No se pudo guardar en este navegador.');
  dibujar();
}

// Crea las opciones de una lista desplegable
function opciones(lista, seleccionado) {
  return lista.map((item) => `
    <option value="${esc(item.id)}" ${item.id === seleccionado ? 'selected' : ''}>${esc(item.nombre)}</option>
  `).join('');
}

// Pasa el texto de un campo de dinero a número: '-1.250.000' -> -1250000
function leerDinero(texto) {
  const digitos = texto.replace(/\D/g, '');
  if (digitos === '') return 0;
  return Number(digitos) * (texto.trim().startsWith('-') ? -1 : 1);
}

// Pone los puntos de miles mientras se escribe, sin mover el cursor de lugar
function formatearCampoDinero(campo) {
  const digitosAntes = campo.value.slice(0, campo.selectionStart).replace(/\D/g, '').length;
  const negativo = 'negativo' in campo.dataset && campo.value.trim().startsWith('-');
  const digitos = campo.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);
  const texto = digitos ? Number(digitos).toLocaleString('es-CO', { useGrouping: 'always' }) : '';
  campo.value = (negativo ? '-' : '') + texto;

  // Busca dónde debe quedar el cursor contando dígitos
  let posicion = negativo ? 1 : 0;
  let vistos = 0;
  while (vistos < digitosAntes && posicion < campo.value.length) {
    if (/\d/.test(campo.value[posicion])) vistos++;
    posicion++;
  }
  campo.setSelectionRange(posicion, posicion);
}

// Valor inicial de un campo de dinero, ya con puntos
function dineroEnCampo(valor) {
  return valor ? valor.toLocaleString('es-CO', { useGrouping: 'always' }) : '';
}

// ---------------------------------------------------------
// Pantalla: Inicio
// ---------------------------------------------------------
function vistaInicio() {
  const t = totalesDelMes(ui.mes);
  const nCuentas = estado.cuentas.length;
  const signoBalance = t.balance > 0 ? '+' : '';

  // Si no hay ningún movimiento se ofrece empezar
  const bienvenida = estado.movimientos.length > 0 ? '' : `
    <section class="tarjeta vacio">
      <h2>¡Hola! Empieza anotando tu primer ingreso o gasto</h2>
      <p>Tus datos se quedan guardados en este dispositivo.</p>
      <div class="botones">
        <button class="boton boton-principal" data-accion="nuevo-movimiento">+ Agregar movimiento</button>
        <button class="boton" data-accion="cargar-ejemplo">Ver con datos de ejemplo</button>
      </div>
    </section>`;

  return `
    <div class="pila">
      ${bienvenida}
      <section class="tarjeta">
        <p class="etiqueta">Dinero total</p>
        <p class="hero-valor">${pesos(saldoTotal())}</p>
        <p class="ayuda">Suma de ${nCuentas === 1 ? 'tu cuenta' : `tus ${nCuentas} cuentas`}</p>
        ${totalDeudas() > 0 ? `<p class="ayuda">Deudas pendientes: ${pesos(totalDeudas())}</p>` : ''}
      </section>

      <div class="cifras">
        <section class="tarjeta">
          <p class="etiqueta">Ingresos del mes</p>
          <p class="cifra-valor">${pesos(t.ingresos)}</p>
        </section>
        <section class="tarjeta">
          <p class="etiqueta">Gastos del mes</p>
          <p class="cifra-valor">${pesos(t.gastos)}</p>
        </section>
        <section class="tarjeta">
          <p class="etiqueta">Lo que te queda del mes</p>
          <p class="cifra-valor ${t.balance > 0 ? 'positivo' : ''}">${signoBalance}${pesos(t.balance)}</p>
        </section>
      </div>

      <div class="dos-columnas">
        <section class="tarjeta">
          <h2>Ingresos y gastos</h2>
          <p class="ayuda">Últimos 6 meses</p>
          <div class="leyenda">
            <span><i style="background:var(--serie-ingresos)"></i>Ingresos</span>
            <span><i style="background:var(--serie-gastos)"></i>Gastos</span>
          </div>
          <div class="grafica" id="grafica-meses"></div>
          ${tablaMeses()}
        </section>

        <section class="tarjeta">
          <div class="encabezado-seccion">
            <div>
              <h2>¿En qué se fue la plata?</h2>
              <p class="ayuda">Gastos por categoría de ${esc(nombreMes(ui.mes).toLowerCase())}</p>
            </div>
            <button class="boton" data-accion="nueva-categoria-gasto">+ Nueva categoría</button>
          </div>
          <div id="grafica-categorias"></div>
          ${tablaCategorias()}
        </section>
      </div>
    </div>`;
}

// Las mismas cifras de las gráficas, en forma de tabla
function tablaMeses() {
  const filas = ultimosMeses(ui.mes, 6).map((m) => `
    <tr>
      <td>${esc(nombreMes(m.mes))}</td>
      <td class="num">${pesos(m.ingresos)}</td>
      <td class="num">${pesos(m.gastos)}</td>
    </tr>`).join('');
  return `
    <details class="tabla-detalle">
      <summary>Ver como tabla</summary>
      <table>
        <thead><tr><th>Mes</th><th class="num">Ingresos</th><th class="num">Gastos</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </details>`;
}

function tablaCategorias() {
  const categorias = gastosPorCategoria(ui.mes);
  if (categorias.length === 0) return '';
  const filas = categorias.map((c) => `
    <tr><td>${esc(c.nombre)}</td><td class="num">${pesos(c.total)}</td></tr>`).join('');
  return `
    <details class="tabla-detalle">
      <summary>Ver como tabla</summary>
      <table>
        <thead><tr><th>Categoría</th><th class="num">Gastado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </details>`;
}

// Las gráficas necesitan saber el ancho real, por eso se dibujan al final
function dibujarGraficas() {
  if (ui.vista !== 'inicio') return;
  graficaMensual(document.getElementById('grafica-meses'), ultimosMeses(ui.mes, 6));
  graficaCategorias(document.getElementById('grafica-categorias'), gastosPorCategoria(ui.mes));
}

// ---------------------------------------------------------
// Pantalla: Movimientos
// ---------------------------------------------------------
function vistaMovimientos() {
  const f = ui.filtro;
  return `
    <section class="tarjeta">
      <div class="filtros">
        <input type="search" id="filtro-texto" placeholder="Buscar por descripción…"
               aria-label="Buscar" value="${esc(f.texto)}">
        <select id="filtro-tipo" aria-label="Filtrar por tipo">
          <option value="">Todos los tipos</option>
          <option value="gasto" ${f.tipo === 'gasto' ? 'selected' : ''}>Gastos</option>
          <option value="ingreso" ${f.tipo === 'ingreso' ? 'selected' : ''}>Ingresos</option>
          <option value="transferencia" ${f.tipo === 'transferencia' ? 'selected' : ''}>Transferencias</option>
        </select>
        <select id="filtro-categoria" aria-label="Filtrar por categoría">
          <option value="">Todas las categorías</option>
          ${opciones(estado.categorias, f.categoriaId)}
        </select>
      </div>
      <div id="lista-movimientos">${listaMovimientos()}</div>
    </section>`;
}

// La lista va aparte para actualizarla al escribir en el buscador
// sin que la caja de búsqueda pierda el cursor.
function listaMovimientos() {
  const { texto, tipo, categoriaId } = ui.filtro;
  const buscado = texto.trim().toLowerCase();

  const lista = movimientosDelMes(ui.mes).filter((m) => {
    if (tipo && m.tipo !== tipo) return false;
    if (categoriaId && m.categoriaId !== categoriaId) return false;
    if (buscado && !tituloMovimiento(m).toLowerCase().includes(buscado)) return false;
    return true;
  });

  if (lista.length === 0) {
    return '<p class="vacio">No hay movimientos para mostrar en este mes.</p>';
  }

  return `<ul class="lista">${lista.map(filaMovimiento).join('')}</ul>`;
}

// El título es la descripción; si no se escribió, se usa la categoría
function tituloMovimiento(m) {
  if (m.descripcion) return m.descripcion;
  return m.tipo === 'transferencia' ? 'Transferencia' : buscarCategoria(m.categoriaId).nombre;
}

function filaMovimiento(m) {
  const cuenta = buscarCuenta(m.cuentaId).nombre;
  let detalle;
  let monto;
  let clase = '';

  if (m.tipo === 'transferencia') {
    detalle = `${cuenta} → ${buscarCuenta(m.cuentaDestinoId).nombre}`;
    monto = pesos(m.monto);
  } else {
    detalle = `${buscarCategoria(m.categoriaId).nombre} · ${cuenta}`;
    monto = `${m.tipo === 'ingreso' ? '+' : '−'}${pesos(m.monto)}`;
    if (m.tipo === 'ingreso') clase = 'positivo';
  }

  return `
    <li class="mov">
      <span class="mov-fecha">${esc(fechaCorta(m.fecha))}</span>
      <div>
        <div class="mov-titulo">${esc(tituloMovimiento(m))}</div>
        <div class="mov-detalle">${esc(detalle)}</div>
      </div>
      <span class="mov-monto num ${clase}">${monto}</span>
      <div class="mov-acciones">
        <button class="enlace" data-accion="editar-movimiento" data-id="${esc(m.id)}">Editar</button>
        <button class="enlace" data-accion="borrar-movimiento" data-id="${esc(m.id)}">Borrar</button>
      </div>
    </li>`;
}

// ---------------------------------------------------------
// Pantalla: Presupuesto
// ---------------------------------------------------------
function vistaPresupuestos() {
  const gastado = Object.fromEntries(gastosPorCategoria(ui.mes).map((c) => [c.id, c.total]));
  const categorias = categoriasDe('gasto');
  const conLimite = categorias.filter((c) => estado.presupuestos[c.id]);
  const sinLimite = categorias.filter((c) => !estado.presupuestos[c.id]);

  const totalLimite = conLimite.reduce((s, c) => s + estado.presupuestos[c.id], 0);
  const totalGastado = conLimite.reduce((s, c) => s + (gastado[c.id] ?? 0), 0);

  const resumen = conLimite.length === 0 ? '' : `
    <section class="tarjeta">
      <p class="etiqueta">Gastado de lo presupuestado</p>
      <p class="hero-valor">${pesos(totalGastado)}</p>
      <p class="ayuda">de ${pesos(totalLimite)} en total</p>
    </section>`;

  const conLimiteHtml = conLimite.length === 0
    ? '<p class="vacio">Ponle un límite mensual a una categoría y aquí verás cómo vas.</p>'
    : conLimite.map((c) => filaPresupuesto(c, gastado[c.id] ?? 0)).join('');

  const sinLimiteHtml = sinLimite.length === 0 ? '' : `
    <section class="tarjeta">
      <h2>Categorías sin límite</h2>
      ${sinLimite.map((c) => `
        <div class="fila-simple">
          <span>${esc(c.nombre)}</span>
          <div class="fila-derecha">
            <span class="ayuda num">${pesos(gastado[c.id] ?? 0)} este mes</span>
            <button class="enlace" data-accion="editar-presupuesto" data-id="${esc(c.id)}">Poner límite</button>
          </div>
        </div>`).join('')}
    </section>`;

  return `
    <div class="pila">
      ${resumen}
      <section class="tarjeta">
        <h2>Límites del mes</h2>
        ${conLimiteHtml}
      </section>
      ${sinLimiteHtml}
    </div>`;
}

function filaPresupuesto(categoria, gastado) {
  const limite = estado.presupuestos[categoria.id];
  const porcentaje = (gastado / limite) * 100;

  // El estado siempre lleva icono y texto: el color nunca va solo
  let estadoFila;
  if (porcentaje > 100) {
    estadoFila = { clase: 'estado-critico', icono: '✕', texto: `Te pasaste por ${pesos(gastado - limite)}` };
  } else if (porcentaje === 100) {
    estadoFila = { clase: 'estado-alerta', icono: '!', texto: 'Llegaste justo al límite' };
  } else if (porcentaje >= 80) {
    estadoFila = { clase: 'estado-alerta', icono: '!', texto: `Cerca del límite: quedan ${pesos(limite - gastado)}` };
  } else {
    estadoFila = { clase: 'estado-bien', icono: '✓', texto: `Vas bien: quedan ${pesos(limite - gastado)}` };
  }

  return `
    <div class="presupuesto ${estadoFila.clase}">
      <div class="presupuesto-fila">
        <strong>${esc(categoria.nombre)}</strong>
        <span class="num">${pesos(gastado)} de ${pesos(limite)}</span>
      </div>
      <div class="medidor" aria-hidden="true"><div style="width:${Math.min(100, porcentaje)}%"></div></div>
      <div class="presupuesto-fila">
        <span class="estado-texto"><span class="estado-icono" aria-hidden="true">${estadoFila.icono}</span>${estadoFila.texto}</span>
        <button class="enlace" data-accion="editar-presupuesto" data-id="${esc(categoria.id)}">Cambiar</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------
// Pantalla: Deudas
// ---------------------------------------------------------
function vistaDeudas() {
  const activas = estado.deudas.filter((d) => pendienteDeuda(d) > 0);
  const pagadas = estado.deudas.filter((d) => pendienteDeuda(d) <= 0);

  // Arma una tarjeta con las deudas de un tipo; si no hay ninguna, no se muestra
  const grupo = (tipo, titulo) => {
    const lista = activas.filter((d) => d.tipoAcreedor === tipo);
    if (lista.length === 0) return '';
    return `
      <section class="tarjeta">
        <div class="presupuesto-fila">
          <h2>${titulo}</h2>
          <strong class="num">${pesos(totalDeudas(tipo))}</strong>
        </div>
        ${lista.map(filaDeuda).join('')}
      </section>`;
  };

  const vacio = estado.deudas.length > 0 ? '' : `
    <section class="tarjeta vacio">
      <h2>No tienes deudas anotadas</h2>
      <p>Agrega lo que le debes a una persona o a una entidad para ir llevando tus abonos.</p>
    </section>`;

  const seccionPagadas = pagadas.length === 0 ? '' : `
    <section class="tarjeta">
      <details>
        <summary>Deudas pagadas (${pagadas.length})</summary>
        ${pagadas.map(filaDeuda).join('')}
      </details>
    </section>`;

  return `
    <div class="pila">
      <section class="tarjeta">
        <div class="encabezado-seccion">
          <div>
            <p class="etiqueta">Total que debes</p>
            <p class="hero-valor">${pesos(totalDeudas())}</p>
          </div>
          <button class="boton" data-accion="nueva-deuda">+ Nueva deuda</button>
        </div>
      </section>
      ${vacio}
      ${grupo('persona', 'A personas')}
      ${grupo('entidad', 'A entidades')}
      ${seccionPagadas}
    </div>`;
}

// Texto de la fecha límite. Como en el presupuesto, el color nunca va solo.
function avisoVencimiento(deuda) {
  if (!deuda.vencimiento) return '';
  const dias = diasHasta(deuda.vencimiento);
  const palabraDias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

  let clase = '';
  let icono = '';
  let texto = `Vence el ${fechaConAnio(deuda.vencimiento)}`;
  if (dias < 0) {
    clase = 'estado-critico';
    icono = '✕';
    texto = `Venció hace ${palabraDias(-dias)}`;
  } else if (dias <= 7) {
    clase = 'estado-alerta';
    icono = '!';
    texto = dias === 0 ? 'Vence hoy' : `Vence en ${palabraDias(dias)}`;
  }

  return `
    <span class="estado-texto ${clase}">
      ${icono ? `<span class="estado-icono" aria-hidden="true">${icono}</span>` : ''}${texto}
    </span>`;
}

function filaDeuda(deuda) {
  const pagado = pagadoDeuda(deuda.id);
  const pendiente = pendienteDeuda(deuda);
  const abonos = abonosDe(deuda.id);
  const estaPagada = pendiente <= 0;

  const historial = abonos.length === 0 ? '' : `
    <details class="tabla-detalle">
      <summary>Ver abonos (${abonos.length})</summary>
      ${abonos.map((m) => `
        <div class="fila-simple">
          <span>${esc(fechaConAnio(m.fecha))} · ${esc(buscarCuenta(m.cuentaId).nombre)}</span>
          <div class="fila-derecha">
            <span class="num">${pesos(m.monto)}</span>
            <button class="enlace" data-accion="editar-movimiento" data-id="${esc(m.id)}">Editar</button>
            <button class="enlace" data-accion="borrar-movimiento" data-id="${esc(m.id)}">Borrar</button>
          </div>
        </div>`).join('')}
    </details>`;

  return `
    <div class="presupuesto estado-neutro">
      <div class="presupuesto-fila">
        <strong class="deuda-nombre">${esc(deuda.acreedor)}</strong>
        <strong class="num">${estaPagada ? 'Pagada' : pesos(pendiente)}</strong>
      </div>
      ${deuda.nota ? `<p class="ayuda">${esc(deuda.nota)}</p>` : ''}
      <div class="medidor" aria-hidden="true"><div style="width:${Math.min(100, (pagado / deuda.monto) * 100)}%"></div></div>
      <div class="presupuesto-fila">
        <span class="ayuda num">Pagado ${pesos(pagado)} de ${pesos(deuda.monto)}</span>
        ${estaPagada ? '' : avisoVencimiento(deuda)}
      </div>
      <div class="deuda-acciones">
        ${estaPagada ? '' : `<button class="boton" data-accion="abonar-deuda" data-id="${esc(deuda.id)}">Abonar</button>`}
        <button class="enlace" data-accion="editar-deuda" data-id="${esc(deuda.id)}">Editar</button>
        <button class="enlace" data-accion="borrar-deuda" data-id="${esc(deuda.id)}">Borrar</button>
      </div>
      ${historial}
    </div>`;
}

// ---------------------------------------------------------
// Pantalla: Cuentas
// ---------------------------------------------------------
function vistaCuentas() {
  const filas = estado.cuentas.map((c) => `
    <div class="fila-simple">
      <div>
        <strong>${esc(c.nombre)}</strong>
        <div class="ayuda">${esc(TIPOS_CUENTA[c.tipo])}</div>
      </div>
      <div class="fila-derecha">
        <span class="num">${pesos(saldoCuenta(c.id))}</span>
        <button class="enlace" data-accion="editar-cuenta" data-id="${esc(c.id)}">Editar</button>
        <button class="enlace" data-accion="borrar-cuenta" data-id="${esc(c.id)}">Borrar</button>
      </div>
    </div>`).join('');

  return `
    <div class="pila">
      <section class="tarjeta">
        <p class="etiqueta">Dinero total</p>
        <p class="hero-valor">${pesos(saldoTotal())}</p>
      </section>
      <section class="tarjeta">
        <div class="encabezado-seccion">
          <h2>Mis cuentas</h2>
          <button class="boton" data-accion="nueva-cuenta">+ Nueva cuenta</button>
        </div>
        ${filas}
      </section>
    </div>`;
}

// ---------------------------------------------------------
// Pantalla: Ajustes
// ---------------------------------------------------------
function vistaAjustes() {
  const chips = (tipo) => categoriasDe(tipo).map((c) => `
    <span class="chip">${esc(c.nombre)}
      <button data-accion="borrar-categoria" data-id="${esc(c.id)}" aria-label="Borrar ${esc(c.nombre)}">×</button>
    </span>`).join('');

  return `
    <div class="pila">
      <section class="tarjeta">
        <h2>Categorías de gasto</h2>
        <div class="chips">${chips('gasto')}</div>
        <h2>Categorías de ingreso</h2>
        <div class="chips">${chips('ingreso')}</div>
        <form class="en-linea" data-form="categoria">
          <input name="nombre" placeholder="Nueva categoría" aria-label="Nombre de la categoría" maxlength="40" required>
          <select name="tipo" aria-label="Tipo de categoría" style="flex: 0 1 130px">
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
          <button class="boton" type="submit">Agregar</button>
        </form>
      </section>

      <section class="tarjeta">
        <h2>Respaldo de tus datos</h2>
        <p class="ayuda">Tus datos solo están en este navegador. Si borras el historial del navegador o cambias de dispositivo se pierden, así que descarga un respaldo de vez en cuando.</p>
        <div class="botones">
          <button class="boton" data-accion="exportar">Descargar respaldo</button>
          <button class="boton" data-accion="importar">Restaurar respaldo</button>
        </div>
      </section>

      <section class="tarjeta">
        <h2>Borrar todo</h2>
        <p class="ayuda">Elimina todas tus cuentas, movimientos y presupuestos de este navegador.</p>
        <div class="botones">
          <button class="boton boton-peligro" data-accion="borrar-todo">Borrar todos mis datos</button>
        </div>
      </section>
    </div>`;
}

// ---------------------------------------------------------
// Dibujar la pantalla activa
// ---------------------------------------------------------
function dibujar() {
  const vistas = {
    inicio: vistaInicio,
    movimientos: vistaMovimientos,
    presupuestos: vistaPresupuestos,
    deudas: vistaDeudas,
    cuentas: vistaCuentas,
    ajustes: vistaAjustes,
  };

  document.getElementById('titulo-vista').textContent = TITULOS[ui.vista];
  document.getElementById('nombre-mes').textContent = nombreMes(ui.mes);
  document.getElementById('selector-mes').hidden = VISTAS_SIN_MES.includes(ui.vista);

  document.querySelectorAll('.menu-item').forEach((boton) => {
    const activo = boton.dataset.vista === ui.vista;
    boton.classList.toggle('activo', activo);
    if (activo) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  });

  document.getElementById('banner-ejemplo').innerHTML = !estado.esEjemplo ? '' : `
    <div class="banner">
      <span>Estás viendo datos de ejemplo.</span>
      <button class="boton" data-accion="salir-ejemplo">Empezar con mis datos</button>
    </div>`;

  contenido.innerHTML = vistas[ui.vista]();
  dibujarGraficas();
}

// ---------------------------------------------------------
// Formularios (ventana emergente)
// ---------------------------------------------------------
function abrirDialogo(html) {
  dialogo.innerHTML = html;
  dialogo.showModal();
}

function formularioMovimiento(movimiento) {
  const m = movimiento ?? { tipo: 'gasto', monto: 0, fecha: hoy(), cuentaId: estado.cuentas[0].id, descripcion: '' };
  const marcado = (tipo) => (m.tipo === tipo ? 'checked' : '');

  abrirDialogo(`
    <form data-form="movimiento" data-id="${esc(m.id ?? '')}">
      <h2>${movimiento ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
      <fieldset class="segmentos" aria-label="Tipo de movimiento">
        <label><input type="radio" name="tipo" value="gasto" ${marcado('gasto')}>Gasto</label>
        <label><input type="radio" name="tipo" value="ingreso" ${marcado('ingreso')}>Ingreso</label>
        <label><input type="radio" name="tipo" value="transferencia" ${marcado('transferencia')}>Transferencia</label>
      </fieldset>
      <label class="campo">Monto
        <input name="monto" class="campo-dinero" inputmode="numeric" autocomplete="off" required
               placeholder="0" value="${dineroEnCampo(m.monto)}">
      </label>
      <label class="campo"><span id="texto-cuenta">Método de pago</span>
        <select name="cuentaId">${opciones(estado.cuentas, m.cuentaId)}</select>
      </label>
      <label class="campo" id="campo-destino">Hacia la cuenta
        <select name="cuentaDestinoId">${opciones(estado.cuentas, m.cuentaDestinoId)}</select>
      </label>
      <label class="campo" id="campo-categoria">Categoría
        <select name="categoriaId" data-seleccion="${esc(m.categoriaId ?? '')}"></select>
      </label>
      <label class="campo">Fecha
        <input type="date" name="fecha" required value="${esc(m.fecha)}">
      </label>
      <label class="campo">Descripción (opcional)
        <input name="descripcion" maxlength="100" autocomplete="off" value="${esc(m.descripcion)}">
      </label>
      <p class="error" role="alert"></p>
      <div class="dialogo-botones">
        <button type="button" class="boton" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="boton boton-principal">Guardar</button>
      </div>
    </form>`);
  ajustarFormularioMovimiento();
}

// Cambia los campos visibles según sea gasto, ingreso o transferencia
function ajustarFormularioMovimiento() {
  const form = dialogo.querySelector('[data-form="movimiento"]');
  const tipo = form.elements.tipo.value;
  const esTransferencia = tipo === 'transferencia';

  dialogo.querySelector('#campo-destino').hidden = esTransferencia === false;
  dialogo.querySelector('#campo-categoria').hidden = esTransferencia;
  dialogo.querySelector('#texto-cuenta').textContent = esTransferencia ? 'Desde la cuenta' : 'Método de pago';

  if (!esTransferencia) {
    const lista = form.elements.categoriaId;
    lista.innerHTML = opciones(categoriasDe(tipo), lista.dataset.seleccion);
  }
}

function guardarMovimiento(form, datos) {
  const tipo = datos.get('tipo');
  const monto = leerDinero(datos.get('monto'));
  const fecha = datos.get('fecha');
  const cuentaId = datos.get('cuentaId');
  const cuentaDestinoId = datos.get('cuentaDestinoId');

  if (monto <= 0) return 'Escribe un monto mayor que cero.';
  if (tipo === 'transferencia' && cuentaId === cuentaDestinoId) {
    return estado.cuentas.length < 2
      ? 'Para transferir necesitas al menos dos cuentas.'
      : 'Escoge dos cuentas diferentes.';
  }

  // Si el movimiento es un abono sigue ligado a su deuda, y no puede pasarse de ella.
  // Si lo cambian a ingreso o transferencia, deja de ser abono.
  const anterior = estado.movimientos.find((m) => m.id === form.dataset.id);
  const deudaId = tipo === 'gasto' ? anterior?.deudaId ?? null : null;
  if (deudaId) {
    const maximo = pendienteDeuda(buscarDeuda(deudaId)) + anterior.monto;
    if (monto > maximo) return `Ese abono supera lo que se debe (${pesos(maximo)}).`;
  }

  const movimiento = {
    id: form.dataset.id || crearId(),
    tipo,
    monto,
    fecha,
    cuentaId,
    cuentaDestinoId: tipo === 'transferencia' ? cuentaDestinoId : null,
    categoriaId: tipo === 'transferencia' ? null : datos.get('categoriaId'),
    descripcion: datos.get('descripcion').trim(),
    deudaId,
  };

  const posicion = estado.movimientos.findIndex((m) => m.id === movimiento.id);
  if (posicion >= 0) estado.movimientos[posicion] = movimiento;
  else estado.movimientos.push(movimiento);

  // Se muestra el mes del movimiento para que se vea dónde quedó
  ui.mes = mesDe(fecha);
  dialogo.close();
  guardarYDibujar('Movimiento guardado');
  return null;
}

function formularioCuenta(cuenta) {
  const c = cuenta ?? { nombre: '', tipo: 'banco', saldoInicial: 0 };
  const tipos = Object.entries(TIPOS_CUENTA).map(([id, nombre]) => ({ id, nombre }));
  const valor = c.saldoInicial < 0 ? `-${dineroEnCampo(-c.saldoInicial)}` : dineroEnCampo(c.saldoInicial);

  abrirDialogo(`
    <form data-form="cuenta" data-id="${esc(c.id ?? '')}">
      <h2>${cuenta ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
      <label class="campo">Nombre
        <input name="nombre" required maxlength="40" autocomplete="off" value="${esc(c.nombre)}"
               placeholder="Ej: Nequi, Bancolombia">
      </label>
      <label class="campo">Tipo
        <select name="tipo">${opciones(tipos, c.tipo)}</select>
      </label>
      <label class="campo">Saldo inicial
        <input name="saldoInicial" class="campo-dinero" data-negativo inputmode="text" autocomplete="off"
               placeholder="0" value="${valor}">
        <small>Lo que tenías al empezar a usar la app. Si es una deuda, escribe un signo menos antes del valor.</small>
      </label>
      <p class="error" role="alert"></p>
      <div class="dialogo-botones">
        <button type="button" class="boton" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="boton boton-principal">Guardar</button>
      </div>
    </form>`);
}

function guardarCuenta(form, datos) {
  const nombre = datos.get('nombre').trim();
  if (!nombre) return 'Escribe un nombre para la cuenta.';

  const valores = { nombre, tipo: datos.get('tipo'), saldoInicial: leerDinero(datos.get('saldoInicial')) };
  const existente = buscarCuenta(form.dataset.id);
  if (existente) Object.assign(existente, valores);
  else estado.cuentas.push({ id: crearId(), ...valores });

  dialogo.close();
  guardarYDibujar('Cuenta guardada');
  return null;
}

function formularioPresupuesto(categoria) {
  const actual = estado.presupuestos[categoria.id] ?? 0;
  abrirDialogo(`
    <form data-form="presupuesto" data-id="${esc(categoria.id)}">
      <h2>Límite para ${esc(categoria.nombre)}</h2>
      <label class="campo">Máximo al mes
        <input name="limite" class="campo-dinero" inputmode="numeric" autocomplete="off"
               placeholder="0" value="${dineroEnCampo(actual)}">
        <small>Déjalo vacío para quitar el límite.</small>
      </label>
      <p class="error" role="alert"></p>
      <div class="dialogo-botones">
        <button type="button" class="boton" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="boton boton-principal">Guardar</button>
      </div>
    </form>`);
}

function guardarPresupuesto(form, datos) {
  const limite = leerDinero(datos.get('limite'));
  if (limite > 0) estado.presupuestos[form.dataset.id] = limite;
  else delete estado.presupuestos[form.dataset.id];

  dialogo.close();
  guardarYDibujar(limite > 0 ? 'Límite guardado' : 'Límite eliminado');
  return null;
}

// Agrega la categoría a la lista. Devuelve un mensaje si no se pudo, o null si quedó bien.
function crearCategoria(nombre, tipo) {
  const repetida = categoriasDe(tipo).some((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
  if (repetida) return 'Ya existe una categoría con ese nombre.';

  estado.categorias.push({ id: crearId(), nombre, tipo });
  return null;
}

// Agrega una categoría desde el formulario de la pantalla Ajustes
function guardarCategoria(form, datos) {
  const nombre = datos.get('nombre').trim();
  if (!nombre) return null;

  const error = crearCategoria(nombre, datos.get('tipo'));
  if (error) avisar(error);
  else guardarYDibujar('Categoría agregada');
  return null;
}

// Ventana para crear una categoría de gasto desde "¿En qué se fue la plata?"
function formularioCategoriaGasto() {
  abrirDialogo(`
    <form data-form="categoria-gasto">
      <h2>Nueva categoría de gasto</h2>
      <label class="campo">Nombre
        <input name="nombre" maxlength="40" autocomplete="off" required autofocus placeholder="Ej: Gasolina">
        <small>Aparecerá en la gráfica cuando anotes un gasto con ella.</small>
      </label>
      <p class="error" role="alert"></p>
      <div class="dialogo-botones">
        <button type="button" class="boton" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="boton boton-principal">Crear</button>
      </div>
    </form>`);
}

function guardarCategoriaGasto(form, datos) {
  const nombre = datos.get('nombre').trim();
  if (!nombre) return 'Escribe un nombre para la categoría.';

  const error = crearCategoria(nombre, 'gasto');
  if (error) return error;

  dialogo.close();
  guardarYDibujar(`"${nombre}" creada. Ya la puedes escoger al agregar un gasto.`);
  return null;
}

function formularioDeuda(deuda) {
  const d = deuda ?? { acreedor: '', tipoAcreedor: 'persona', monto: 0, vencimiento: '', nota: '' };
  const marcado = (tipo) => (d.tipoAcreedor === tipo ? 'checked' : '');

  abrirDialogo(`
    <form data-form="deuda" data-id="${esc(d.id ?? '')}">
      <h2>${deuda ? 'Editar deuda' : 'Nueva deuda'}</h2>
      <fieldset class="segmentos dos" aria-label="A quién le debes">
        <label><input type="radio" name="tipoAcreedor" value="persona" ${marcado('persona')}>Persona</label>
        <label><input type="radio" name="tipoAcreedor" value="entidad" ${marcado('entidad')}>Entidad</label>
      </fieldset>
      <label class="campo">¿A quién le debes?
        <input name="acreedor" required maxlength="60" autocomplete="off" value="${esc(d.acreedor)}"
               placeholder="Ej: Juan o Banco de Bogotá">
      </label>
      <label class="campo">¿Cuánto debes?
        <input name="monto" class="campo-dinero" inputmode="numeric" autocomplete="off" required
               placeholder="0" value="${dineroEnCampo(d.monto)}">
        <small>Si ya pagaste una parte antes de usar la app, escribe solo lo que debes hoy.</small>
      </label>
      <label class="campo">Fecha límite de pago (opcional)
        <input type="date" name="vencimiento" value="${esc(d.vencimiento)}">
      </label>
      <label class="campo">Nota (opcional)
        <input name="nota" maxlength="100" autocomplete="off" value="${esc(d.nota)}"
               placeholder="Ej: 12 cuotas mensuales">
      </label>
      <p class="error" role="alert"></p>
      <div class="dialogo-botones">
        <button type="button" class="boton" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="boton boton-principal">Guardar</button>
      </div>
    </form>`);
}

function guardarDeuda(form, datos) {
  const acreedor = datos.get('acreedor').trim();
  const monto = leerDinero(datos.get('monto'));
  if (!acreedor) return 'Escribe a quién le debes.';
  if (monto <= 0) return 'Escribe un monto mayor que cero.';

  const valores = {
    acreedor,
    tipoAcreedor: datos.get('tipoAcreedor'),
    monto,
    vencimiento: datos.get('vencimiento'),
    nota: datos.get('nota').trim(),
  };

  const existente = buscarDeuda(form.dataset.id);
  if (existente) {
    const pagado = pagadoDeuda(existente.id);
    if (monto < pagado) return `Ya abonaste ${pesos(pagado)}; el monto no puede ser menor.`;
    Object.assign(existente, valores);
  } else {
    estado.deudas.push({ id: crearId(), ...valores });
  }

  dialogo.close();
  guardarYDibujar('Deuda guardada');
  return null;
}

function formularioAbono(deuda) {
  // Se propone la categoría "Deudas" si existe; si la borraron, la primera de gastos
  const gastos = categoriasDe('gasto');
  const sugerida = gastos.find((c) => c.nombre.toLowerCase() === 'deudas') ?? gastos[0];

  abrirDialogo(`
    <form data-form="abono" data-id="${esc(deuda.id)}">
      <h2>Abonar a ${esc(deuda.acreedor)}</h2>
      <p class="ayuda" style="margin-bottom:12px">Debes ${pesos(pendienteDeuda(deuda))}</p>
      <label class="campo">Valor del abono
        <input name="monto" class="campo-dinero" inputmode="numeric" autocomplete="off" required placeholder="0">
      </label>
      <label class="campo">¿De qué cuenta sale?
        <select name="cuentaId">${opciones(estado.cuentas, estado.cuentas[0].id)}</select>
      </label>
      <label class="campo">Categoría
        <select name="categoriaId">${opciones(gastos, sugerida.id)}</select>
      </label>
      <label class="campo">Fecha
        <input type="date" name="fecha" required value="${hoy()}">
      </label>
      <p class="error" role="alert"></p>
      <div class="dialogo-botones">
        <button type="button" class="boton" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="boton boton-principal">Guardar abono</button>
      </div>
    </form>`);
}

function guardarAbono(form, datos) {
  const deuda = buscarDeuda(form.dataset.id);
  const monto = leerDinero(datos.get('monto'));
  const pendiente = pendienteDeuda(deuda);

  if (monto <= 0) return 'Escribe un monto mayor que cero.';
  if (monto > pendiente) return `El abono supera lo que debes (${pesos(pendiente)}).`;

  // El abono se guarda como un gasto ligado a la deuda
  estado.movimientos.push({
    id: crearId(),
    tipo: 'gasto',
    monto,
    fecha: datos.get('fecha'),
    cuentaId: datos.get('cuentaId'),
    cuentaDestinoId: null,
    categoriaId: datos.get('categoriaId'),
    descripcion: `Abono a ${deuda.acreedor}`,
    deudaId: deuda.id,
  });

  dialogo.close();
  guardarYDibujar(monto === pendiente ? '¡Deuda pagada por completo!' : 'Abono guardado');
  return null;
}

const GUARDAR_FORMULARIO = {
  deuda: guardarDeuda,
  abono: guardarAbono,
  movimiento: guardarMovimiento,
  cuenta: guardarCuenta,
  presupuesto: guardarPresupuesto,
  categoria: guardarCategoria,
  'categoria-gasto': guardarCategoriaGasto,
};

// ---------------------------------------------------------
// Respaldo: descargar y restaurar
// ---------------------------------------------------------
function exportar() {
  const archivo = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `mis-lukas-respaldo-${hoy()}.json`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
  avisar('Respaldo descargado');
}

async function importar(archivo) {
  let datos;
  try {
    datos = normalizarDatos(JSON.parse(await archivo.text()));
  } catch (error) {
    avisar(error instanceof SyntaxError ? 'Ese archivo no se puede leer.' : error.message);
    return;
  }

  const total = datos.movimientos.length;
  if (!confirm(`Esto reemplazará todos tus datos actuales por los del respaldo (${total} movimientos). ¿Continuar?`)) return;

  estado = datos;
  guardarYDibujar('Respaldo restaurado');
}

// ---------------------------------------------------------
// Acciones de los botones (cada clave es un data-accion del HTML)
// ---------------------------------------------------------
const ACCIONES = {
  'mes-anterior': () => { ui.mes = sumarMeses(ui.mes, -1); dibujar(); },
  'mes-siguiente': () => { ui.mes = sumarMeses(ui.mes, 1); dibujar(); },
  'cerrar-dialogo': () => dialogo.close(),

  'nuevo-movimiento': () => formularioMovimiento(),
  'editar-movimiento': (id) => formularioMovimiento(estado.movimientos.find((m) => m.id === id)),
  'borrar-movimiento': (id) => {
    if (!confirm('¿Borrar este movimiento?')) return;
    estado.movimientos = estado.movimientos.filter((m) => m.id !== id);
    guardarYDibujar('Movimiento borrado');
  },

  'nueva-cuenta': () => formularioCuenta(),
  'editar-cuenta': (id) => formularioCuenta(buscarCuenta(id)),
  'borrar-cuenta': (id) => {
    if (estado.cuentas.length === 1) {
      avisar('Debes tener al menos una cuenta.');
      return;
    }
    const enUso = estado.movimientos.some((m) => m.cuentaId === id || m.cuentaDestinoId === id);
    if (enUso) {
      avisar('Esta cuenta tiene movimientos; bórralos o cámbialos primero.');
      return;
    }
    if (!confirm(`¿Borrar la cuenta "${buscarCuenta(id).nombre}"?`)) return;
    estado.cuentas = estado.cuentas.filter((c) => c.id !== id);
    guardarYDibujar('Cuenta borrada');
  },

  'editar-presupuesto': (id) => formularioPresupuesto(buscarCategoria(id)),

  'nueva-deuda': () => formularioDeuda(),
  'editar-deuda': (id) => formularioDeuda(buscarDeuda(id)),
  'abonar-deuda': (id) => formularioAbono(buscarDeuda(id)),
  'borrar-deuda': (id) => {
    const deuda = buscarDeuda(id);
    const abonos = abonosDe(id);
    const extra = abonos.length > 0
      ? ` Sus ${abonos.length} abonos seguirán apareciendo como gastos en Movimientos.`
      : '';
    if (!confirm(`¿Borrar la deuda con "${deuda.acreedor}"?${extra}`)) return;

    // El dinero de los abonos sí salió, por eso los gastos se quedan sin la deuda
    abonos.forEach((m) => { m.deudaId = null; });
    estado.deudas = estado.deudas.filter((d) => d.id !== id);
    guardarYDibujar('Deuda borrada');
  },

  'nueva-categoria-gasto': () => formularioCategoriaGasto(),
  'borrar-categoria': (id) => {
    const categoria = buscarCategoria(id);
    if (categoriasDe(categoria.tipo).length === 1) {
      avisar('Debes tener al menos una categoría de este tipo.');
      return;
    }
    if (estado.movimientos.some((m) => m.categoriaId === id)) {
      avisar('Esta categoría tiene movimientos; cámbialos primero.');
      return;
    }
    if (!confirm(`¿Borrar la categoría "${categoria.nombre}"?`)) return;
    estado.categorias = estado.categorias.filter((c) => c.id !== id);
    delete estado.presupuestos[id];
    guardarYDibujar('Categoría borrada');
  },

  exportar,
  importar: () => document.getElementById('archivo-respaldo').click(),

  'cargar-ejemplo': () => {
    estado = cargarEjemplo();
    guardarYDibujar('Datos de ejemplo cargados');
  },
  'salir-ejemplo': () => {
    estado = estadoInicial();
    guardarYDibujar('Listo: ya puedes anotar tus datos');
  },
  'borrar-todo': () => {
    if (!confirm('¿Seguro? Se borrarán TODOS tus datos y no se pueden recuperar sin un respaldo.')) return;
    estado = estadoInicial();
    guardarYDibujar('Datos borrados');
  },
};

// ---------------------------------------------------------
// Eventos. Se escucha en todo el documento porque el HTML
// se vuelve a crear cada vez que se dibuja una pantalla.
// ---------------------------------------------------------
document.addEventListener('click', (evento) => {
  const botonMenu = evento.target.closest('[data-vista]');
  if (botonMenu) {
    ui.vista = botonMenu.dataset.vista;
    dibujar();
    window.scrollTo(0, 0);
    return;
  }

  const boton = evento.target.closest('[data-accion]');
  if (boton) ACCIONES[boton.dataset.accion](boton.dataset.id);
});

document.addEventListener('submit', (evento) => {
  const form = evento.target.closest('[data-form]');
  if (!form) return;
  evento.preventDefault(); // evita que la página se recargue

  const error = GUARDAR_FORMULARIO[form.dataset.form](form, new FormData(form));
  if (error) form.querySelector('.error').textContent = error;
});

document.addEventListener('input', (evento) => {
  const campo = evento.target;
  if (campo.classList.contains('campo-dinero')) formatearCampoDinero(campo);

  if (campo.id === 'filtro-texto') {
    ui.filtro.texto = campo.value;
    document.getElementById('lista-movimientos').innerHTML = listaMovimientos();
  }
});

document.addEventListener('change', (evento) => {
  const campo = evento.target;

  if (campo.name === 'tipo' && campo.type === 'radio') {
    ajustarFormularioMovimiento();
  }
  if (campo.id === 'filtro-tipo' || campo.id === 'filtro-categoria') {
    ui.filtro.tipo = document.getElementById('filtro-tipo').value;
    ui.filtro.categoriaId = document.getElementById('filtro-categoria').value;
    document.getElementById('lista-movimientos').innerHTML = listaMovimientos();
  }
  if (campo.id === 'archivo-respaldo' && campo.files[0]) {
    importar(campo.files[0]);
    campo.value = ''; // permite volver a escoger el mismo archivo
  }
});

// Si cambia el tamaño de la ventana, las gráficas se vuelven a medir
let cuadroPendiente = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(cuadroPendiente);
  cuadroPendiente = requestAnimationFrame(dibujarGraficas);
});

// ---------------------------------------------------------
// Para usarla como app en el celular
// ---------------------------------------------------------

// El "service worker" permite abrir la app sin internet.
// El navegador solo lo acepta en páginas https (o en localhost).
if ('serviceWorker' in navigator
    && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.warn('No se pudo activar el modo sin internet:', error);
  });
}

// Le pide al navegador que no borre los datos si le falta espacio
navigator.storage?.persist?.();

// Animación de entrada: un toque la salta, y al terminar se quita de la página
const intro = document.getElementById('intro');
intro.addEventListener('click', () => {
  detenerSonidoIntro();
  intro.remove();
});
intro.addEventListener('animationend', (evento) => {
  if (evento.animationName !== 'intro-salir') return;
  intro.remove();
  // El audio se apaga un poco después para que el tin no quede cortado
  setTimeout(detenerSonidoIntro, 1500);
});

// ¡Arranca la app!
dibujar();
