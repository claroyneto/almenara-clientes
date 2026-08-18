import { supabase } from './supabaseClient.js';
import { esc } from './escapar.js';

const ETIQUETAS_TIPO = { texto: 'Texto', numero: 'Número', seleccion: 'Selección' };

const listaEl = document.getElementById('lista-campos');
const mensajeEl = document.getElementById('config-mensaje');
const tipoEl = document.getElementById('nuevo-tipo');
const campoOpcionesEl = document.getElementById('campo-opciones');

tipoEl.addEventListener('change', () => {
  campoOpcionesEl.style.display = tipoEl.value === 'seleccion' ? 'flex' : 'none';
});

async function cargarCampos() {
  const { data, error } = await supabase
    .from('definiciones_campos')
    .select('id, etiqueta, tipo, opciones')
    .order('orden', { ascending: true });
  if (error) {
    listaEl.innerHTML = `<p class="mensaje error">Error cargando campos: ${esc(error.message)}</p>`;
    return;
  }
  listaEl.innerHTML = data.length
    ? data.map((c) => `
        <div class="fila-campo-config" data-id="${c.id}">
          <span><strong>${esc(c.etiqueta)}</strong> — ${esc(ETIQUETAS_TIPO[c.tipo] ?? c.tipo)}${c.opciones ? ` (${esc(c.opciones.join(', '))})` : ''}</span>
          <button class="peligro btn-borrar" data-id="${c.id}">Eliminar</button>
        </div>
      `).join('')
    : '<p class="mensaje">Todavía no hay campos adicionales configurados.</p>';

  document.querySelectorAll('.btn-borrar').forEach((btn) => {
    btn.addEventListener('click', () => borrarCampo(btn.dataset.id));
  });
}

async function borrarCampo(id) {
  if (!confirm('¿Eliminar este campo? Los datos ya guardados en las fichas de clientes no se borran, pero dejarán de mostrarse.')) return;
  const { error } = await supabase.from('definiciones_campos').delete().eq('id', id);
  if (error) {
    mensajeEl.textContent = `Error: ${error.message}`;
    mensajeEl.className = 'mensaje error';
    return;
  }
  await cargarCampos();
}

document.getElementById('btn-agregar').addEventListener('click', async () => {
  const etiqueta = document.getElementById('nueva-etiqueta').value.trim();
  const tipo = tipoEl.value;
  if (!etiqueta) {
    mensajeEl.textContent = 'Escribe un nombre para el campo.';
    mensajeEl.className = 'mensaje error';
    return;
  }
  let opciones = null;
  if (tipo === 'seleccion') {
    opciones = document.getElementById('nuevas-opciones').value
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (!opciones.length) {
      mensajeEl.textContent = 'Escribe al menos una opción, separadas por coma.';
      mensajeEl.className = 'mensaje error';
      return;
    }
  }

  const { error } = await supabase.from('definiciones_campos').insert({ etiqueta, tipo, opciones });
  if (error) {
    mensajeEl.textContent = `Error: ${error.message}`;
    mensajeEl.className = 'mensaje error';
    return;
  }

  document.getElementById('nueva-etiqueta').value = '';
  document.getElementById('nuevas-opciones').value = '';
  mensajeEl.textContent = 'Campo agregado.';
  mensajeEl.className = 'mensaje';
  await cargarCampos();
});

const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  document.body.innerHTML = '<p>Debes iniciar sesión desde <a href="index.html">la página principal</a> primero.</p>';
} else {
  await cargarCampos();
}
