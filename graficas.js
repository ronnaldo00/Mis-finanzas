// =========================================================
// graficas.js: dibuja las gráficas y el cuadrito de ayuda.
// No usa librerías: las gráficas son SVG armado con texto.
// =========================================================

// Evita que un texto escrito por el usuario se interprete como HTML.
// Se usa SIEMPRE que un dato del usuario se ponga dentro del HTML.
function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (letra) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[letra]));
}

// Busca un valor "redondo" para el tope del eje (1, 2 o 5 por una potencia de 10)
function pasoRedondo(maximo, divisiones) {
  const aproximado = maximo / divisiones;
  const potencia = 10 ** Math.floor(Math.log10(aproximado));
  const proporcion = aproximado / potencia;
  if (proporcion <= 1) return potencia;
  if (proporcion <= 2) return 2 * potencia;
  if (proporcion <= 5) return 5 * potencia;
  return 10 * potencia;
}

// Forma de una columna: arriba con esquinas redondas y abajo recta
function formaColumna(x, y, ancho, alto) {
  const r = Math.min(4, alto, ancho / 2);
  return `M${x},${y + alto}V${y + r}Q${x},${y} ${x + r},${y}`
    + `H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${y + alto}Z`;
}

// Gráfica de columnas: ingresos y gastos de los últimos meses
function graficaMensual(contenedor, meses) {
  const maximo = Math.max(...meses.flatMap((m) => [m.ingresos, m.gastos]));
  if (maximo === 0) {
    contenedor.innerHTML = '<p class="vacio">Todavía no hay movimientos en estos meses.</p>';
    return;
  }

  // Mientras la ventana cambia de tamaño el ancho puede ser muy pequeño por un
  // instante; con un mínimo la gráfica nunca calcula medidas negativas.
  const ancho = Math.max(260, contenedor.clientWidth);
  const alto = 230;
  const margen = { arriba: 10, derecha: 4, abajo: 26, izquierda: 52 };
  const areaAncho = ancho - margen.izquierda - margen.derecha;
  const areaAlto = alto - margen.arriba - margen.abajo;
  const base = margen.arriba + areaAlto;

  const divisiones = 4;
  const paso = pasoRedondo(maximo, divisiones);
  const tope = Math.ceil(maximo / paso) * paso;
  const yDe = (valor) => base - (valor / tope) * areaAlto;

  // Líneas horizontales y números del eje
  let marcas = '';
  for (let valor = 0; valor <= tope; valor += paso) {
    const y = yDe(valor);
    if (valor > 0) marcas += `<line class="rejilla" x1="${margen.izquierda}" x2="${ancho - margen.derecha}" y1="${y}" y2="${y}"/>`;
    marcas += `<text x="${margen.izquierda - 8}" y="${y + 4}" text-anchor="end">${valor === 0 ? '0' : pesosCorto(valor)}</text>`;
  }

  const anchoBanda = areaAncho / meses.length;
  const hueco = 2; // separación entre la columna de ingresos y la de gastos
  const anchoColumna = Math.min(24, (anchoBanda * 0.7 - hueco) / 2);

  let bandas = '';
  let columnas = '';
  let etiquetas = '';

  meses.forEach((m, i) => {
    const xBanda = margen.izquierda + i * anchoBanda;
    const centro = xBanda + anchoBanda / 2;

    // Rectángulo invisible que recibe el mouse: más fácil de alcanzar que la columna
    const ayuda = `${nombreMes(m.mes)}\nIngresos: ${pesos(m.ingresos)}\nGastos: ${pesos(m.gastos)}\nBalance: ${pesos(m.balance)}`;
    bandas += `<rect class="banda" x="${xBanda}" y="${margen.arriba}" width="${anchoBanda}" height="${areaAlto}"
      tabindex="0" role="img" aria-label="${esc(ayuda.replaceAll('\n', ', '))}" data-tip="${esc(ayuda)}"/>`;

    const dibujar = (valor, x, clase) => {
      if (valor <= 0) return '';
      const h = Math.max(2, base - yDe(valor)); // mínimo 2 px para que se alcance a ver
      return `<path class="${clase}" d="${formaColumna(x, base - h, anchoColumna, h)}"/>`;
    };
    columnas += dibujar(m.ingresos, centro - anchoColumna - hueco / 2, 'barra-ingresos');
    columnas += dibujar(m.gastos, centro + hueco / 2, 'barra-gastos');

    etiquetas += `<text x="${centro}" y="${alto - 8}" text-anchor="middle">${esc(mesCorto(m.mes))}</text>`;
  });

  // pointer-events="none" deja que el mouse llegue a las bandas de atrás
  contenedor.innerHTML = `
    <svg height="${alto}" viewBox="0 0 ${ancho} ${alto}" role="group"
         aria-label="Ingresos y gastos de los últimos ${meses.length} meses">
      ${marcas}
      ${bandas}
      <g pointer-events="none">
        ${columnas}
        <line class="linea-base" x1="${margen.izquierda}" x2="${ancho - margen.derecha}" y1="${base}" y2="${base}"/>
        ${etiquetas}
      </g>
    </svg>`;
}

// Barras horizontales: gastos por categoría, de mayor a menor.
// Muestra las 7 más grandes y junta las demás en "Otras".
function graficaCategorias(contenedor, categorias) {
  if (categorias.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No hay gastos en este mes.</p>';
    return;
  }

  let filas = categorias;
  if (categorias.length > 8) {
    const resto = categorias.slice(7);
    filas = [
      ...categorias.slice(0, 7),
      { nombre: `Otras (${resto.length})`, total: resto.reduce((s, c) => s + c.total, 0) },
    ];
  }

  const total = categorias.reduce((suma, c) => suma + c.total, 0);
  const mayor = Math.max(...filas.map((f) => f.total));

  contenedor.innerHTML = `<div class="barras-h">${filas.map((f) => {
    const parte = Math.round((f.total / total) * 100);
    const ayuda = `${f.nombre}\n${pesos(f.total)}\n${parte} % de los gastos del mes`;
    return `
      <div class="fila-barra" tabindex="0" data-tip="${esc(ayuda)}" aria-label="${esc(ayuda.replaceAll('\n', ', '))}" role="img">
        <div class="fila-barra-textos">
          <span>${esc(f.nombre)}</span>
          <span class="num">${pesos(f.total)}</span>
        </div>
        <div class="fila-barra-pista"><div class="fila-barra-relleno" style="width:${(f.total / mayor) * 100}%"></div></div>
      </div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------
// Cuadrito de ayuda (tooltip): sirve con mouse, dedo y teclado.
// Lee el texto del atributo data-tip del elemento señalado.
// ---------------------------------------------------------
const tooltip = document.getElementById('tooltip');

function mostrarTooltip(elemento, x, y) {
  tooltip.textContent = elemento.dataset.tip; // textContent nunca interpreta HTML
  tooltip.hidden = false;

  // Se ubica cerca del puntero sin salirse de la ventana
  const caja = tooltip.getBoundingClientRect();
  const izquierda = Math.min(x + 14, window.innerWidth - caja.width - 8);
  const arriba = Math.min(y + 14, window.innerHeight - caja.height - 8);
  tooltip.style.left = `${Math.max(8, izquierda)}px`;
  tooltip.style.top = `${Math.max(8, arriba)}px`;
}

function ocultarTooltip() {
  tooltip.hidden = true;
}

document.addEventListener('pointermove', (evento) => {
  const elemento = evento.target.closest?.('[data-tip]');
  if (elemento) mostrarTooltip(elemento, evento.clientX, evento.clientY);
  else if (evento.pointerType === 'mouse') ocultarTooltip();
});

// En pantallas táctiles el cuadrito aparece al tocar y se quita al tocar otra parte
document.addEventListener('pointerdown', (evento) => {
  const elemento = evento.target.closest?.('[data-tip]');
  if (elemento) mostrarTooltip(elemento, evento.clientX, evento.clientY);
  else ocultarTooltip();
});

// Con teclado (tecla Tab) el cuadrito aparece junto al elemento enfocado
document.addEventListener('focusin', (evento) => {
  const elemento = evento.target.closest?.('[data-tip]');
  if (!elemento || !elemento.matches(':focus-visible')) return;
  const caja = elemento.getBoundingClientRect();
  mostrarTooltip(elemento, caja.left + caja.width / 2, caja.top + caja.height / 2);
});

document.addEventListener('focusout', (evento) => {
  if (evento.target.closest?.('[data-tip]')) ocultarTooltip();
});
