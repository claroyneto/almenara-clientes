import { supabase } from './supabaseClient.js';

const params = new URLSearchParams(location.search);
const clienteId = params.get('id');

const nombreEl = document.getElementById('nombre');
const rubroEl = document.getElementById('rubro');
const etapaEl = document.getElementById('etapa');
const mensajeEl = document.getElementById('guardado-mensaje');
const notasEl = document.getElementById('lista-notas');

if (!clienteId) {
  document.getElementById('ficha').innerHTML = '<p>No se especificó un cliente.</p>';
} else {
  await cargarFicha();
  await cargarNotas();
}

async function cargarFicha() {
  const { data, error } = await supabase.from('clientes').select('nombre, rubro, etapa').eq('id', clienteId).single();
  if (error) {
    mensajeEl.textContent = `Error: ${error.message}`;
    return;
  }
  nombreEl.value = data.nombre;
  rubroEl.value = data.rubro ?? '';
  etapaEl.value = data.etapa;
}

async function cargarNotas() {
  const { data, error } = await supabase
    .from('notas')
    .select('texto, autor, creado_en')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false });
  if (error) {
    notasEl.innerHTML = `<li>Error cargando notas: ${error.message}</li>`;
    return;
  }
  notasEl.innerHTML = data.length
    ? data.map((n) => `<li><strong>${new Date(n.creado_en).toLocaleDateString('es-CL')} — ${n.autor}:</strong> ${n.texto}</li>`).join('')
    : '<li>Sin notas todavía.</li>';
}

document.getElementById('btn-guardar').addEventListener('click', async () => {
  const { error } = await supabase
    .from('clientes')
    .update({ nombre: nombreEl.value.trim(), rubro: rubroEl.value.trim(), etapa: etapaEl.value })
    .eq('id', clienteId);
  mensajeEl.textContent = error ? `Error: ${error.message}` : 'Guardado.';
});
