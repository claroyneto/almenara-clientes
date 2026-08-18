import { supabase } from './supabaseClient.js';
import { esc } from './escapar.js';

const params = new URLSearchParams(location.search);
const clienteId = params.get('id');

const nombreEl = document.getElementById('nombre');
const rubroEl = document.getElementById('rubro');
const etapaEl = document.getElementById('etapa');
const mensajeEl = document.getElementById('guardado-mensaje');
const notasEl = document.getElementById('lista-notas');
const camposExtraEl = document.getElementById('campos-extra');

let definiciones = [];
let camposExtraActuales = {};

if (!clienteId) {
  document.getElementById('ficha').innerHTML = '<p>No se especificó un cliente.</p>';
} else {
  await cargarDefiniciones();
  await cargarFicha();
  await cargarNotas();

  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const nuevosCamposExtra = {};
    for (const def of definiciones) {
      const input = document.getElementById(`extra-${def.id}`);
      nuevosCamposExtra[def.id] = input.value.trim();
    }

    const { error } = await supabase
      .from('clientes')
      .update({
        nombre: nombreEl.value.trim(),
        rubro: rubroEl.value.trim(),
        etapa: etapaEl.value,
        campos_extra: nuevosCamposExtra
      })
      .eq('id', clienteId);
    mensajeEl.textContent = error ? `Error: ${error.message}` : 'Guardado.';
    mensajeEl.className = error ? 'mensaje error' : 'mensaje';
  });
}

async function cargarDefiniciones() {
  const { data, error } = await supabase
    .from('definiciones_campos')
    .select('id, etiqueta, tipo, opciones')
    .order('orden', { ascending: true });
  definiciones = error ? [] : data;
}

async function cargarFicha() {
  const { data, error } = await supabase.from('clientes').select('nombre, rubro, etapa, campos_extra').eq('id', clienteId).single();
  if (error) {
    mensajeEl.textContent = `Error: ${error.message}`;
    mensajeEl.className = 'mensaje error';
    return;
  }
  nombreEl.value = data.nombre;
  rubroEl.value = data.rubro ?? '';
  etapaEl.value = data.etapa;
  camposExtraActuales = data.campos_extra ?? {};
  renderizarCamposExtra();
}

function renderizarCamposExtra() {
  if (!definiciones.length) {
    camposExtraEl.innerHTML = '';
    return;
  }
  camposExtraEl.innerHTML = definiciones.map((def) => {
    const valorActual = camposExtraActuales[def.id] ?? '';
    if (def.tipo === 'seleccion') {
      const opciones = (def.opciones || [])
        .map((op) => `<option value="${esc(op)}" ${op === valorActual ? 'selected' : ''}>${esc(op)}</option>`)
        .join('');
      return `
        <div class="campo">
          <label>${esc(def.etiqueta)}</label>
          <select id="extra-${def.id}">
            <option value=""></option>
            ${opciones}
          </select>
        </div>`;
    }
    const tipoInput = def.tipo === 'numero' ? 'number' : 'text';
    return `
      <div class="campo">
        <label>${esc(def.etiqueta)}</label>
        <input id="extra-${def.id}" type="${tipoInput}" value="${esc(valorActual)}" />
      </div>`;
  }).join('');
}

async function cargarNotas() {
  const { data, error } = await supabase
    .from('notas')
    .select('texto, autor, creado_en')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false });
  if (error) {
    notasEl.innerHTML = `<li>Error cargando notas: ${esc(error.message)}</li>`;
    return;
  }
  notasEl.innerHTML = data.length
    ? data.map((n) => `
        <li>
          <div class="meta">${new Date(n.creado_en).toLocaleDateString('es-CL')} — ${esc(n.autor)}</div>
          ${esc(n.texto)}
        </li>
      `).join('')
    : '<li>Sin notas todavía.</li>';
}
