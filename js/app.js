import { supabase } from './supabaseClient.js';
import { esc } from './escapar.js';
import { diasDesdeActividad, estadoBrasa, textoRecencia } from './recencia.js';

// Orden fijo de la torre de señales: de "recién avistado" a "en puerto" (o
// descartado). El tablero siempre muestra las 4 columnas en este orden,
// independiente de en qué orden vengan los datos.
const ETAPAS = [
  { id: 'prospecto', etiqueta: 'Prospecto' },
  { id: 'diagnostico', etiqueta: 'Diagnóstico' },
  { id: 'cliente', etiqueta: 'Cliente' },
  { id: 'descartado', etiqueta: 'Descartado' }
];

const loginDiv = document.getElementById('login');
const appDiv = document.getElementById('app');
const loginMensaje = document.getElementById('login-mensaje');
const tableroEl = document.getElementById('tablero');
const buscadorEl = document.getElementById('buscador');

let clientesCache = [];

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) return;
  const { error } = await supabase.auth.signInWithOtp({ email });
  loginMensaje.textContent = error ? `Error: ${error.message}` : 'Revisa tu correo y haz clic en el link.';
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) mostrarApp();
});

async function mostrarApp() {
  loginDiv.style.display = 'none';
  appDiv.style.display = 'block';
  await cargarClientes();
}

async function cargarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, rubro, etapa, actualizado_en')
    .order('actualizado_en', { ascending: false });
  if (error) {
    tableroEl.innerHTML = `<p class="mensaje error">Error cargando clientes: ${esc(error.message)}</p>`;
    return;
  }
  clientesCache = data;
  renderizarTablero();
}

function renderizarTablero() {
  const busqueda = buscadorEl.value.trim().toLowerCase();
  const filtrados = busqueda
    ? clientesCache.filter((c) => c.nombre.toLowerCase().includes(busqueda))
    : clientesCache;

  tableroEl.innerHTML = ETAPAS.map((etapa) => {
    const deEstaEtapa = filtrados.filter((c) => c.etapa === etapa.id);
    const tarjetas = deEstaEtapa.length
      ? deEstaEtapa.map((c) => {
          const dias = diasDesdeActividad(c.actualizado_en);
          // En Descartado no hay nada que "enfriarse" -- el trato ya se
          // cerró, así que la fecha se muestra sin el punto de brasa/ceniza.
          const puntoBrasa = etapa.id === 'descartado' ? '' : `<span class="punto-brasa ${estadoBrasa(dias)}"></span>`;
          return `
            <li>
              <a class="tarjeta-cliente" href="cliente.html?id=${c.id}" style="--etapa-color: var(--etapa-${etapa.id})">
                <div class="nombre">${esc(c.nombre)}</div>
                ${c.rubro ? `<div class="rubro">${esc(c.rubro)}</div>` : ''}
                <div class="recencia">
                  ${puntoBrasa}
                  ${esc(textoRecencia(dias))}
                </div>
              </a>
            </li>`;
        }).join('')
      : `<li class="sin-resultados">${busqueda ? 'Sin resultados.' : 'Nadie en esta etapa todavía.'}</li>`;

    return `
      <div class="columna-etapa ${etapa.id}">
        <div class="columna-cabecera" style="--etapa-color: var(--etapa-${etapa.id})">
          <span class="titulo">${etapa.etiqueta}</span>
          <span class="cuenta">${deEstaEtapa.length}</span>
        </div>
        <ul class="tarjetas-etapa">${tarjetas}</ul>
      </div>`;
  }).join('');
}

buscadorEl.addEventListener('input', renderizarTablero);

// Si ya había una sesión activa (magic link ya usado antes), mostrar la app directo.
const { data: { session } } = await supabase.auth.getSession();
if (session) mostrarApp();
