import { supabase } from './supabaseClient.js';

const ETIQUETAS_ETAPA = { prospecto: 'Prospecto', diagnostico: 'Diagnóstico', cliente: 'Cliente', descartado: 'Descartado' };

const loginDiv = document.getElementById('login');
const appDiv = document.getElementById('app');
const loginMensaje = document.getElementById('login-mensaje');
const listaEl = document.getElementById('lista-clientes');
const buscadorEl = document.getElementById('buscador');
const filtroEtapaEl = document.getElementById('filtro-etapa');

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
    listaEl.innerHTML = `<li>Error cargando clientes: ${error.message}</li>`;
    return;
  }
  clientesCache = data;
  renderizarLista();
}

function renderizarLista() {
  const busqueda = buscadorEl.value.trim().toLowerCase();
  const etapaFiltro = filtroEtapaEl.value;
  const filtrados = clientesCache.filter((c) => {
    const calzaBusqueda = !busqueda || c.nombre.toLowerCase().includes(busqueda);
    const calzaEtapa = !etapaFiltro || c.etapa === etapaFiltro;
    return calzaBusqueda && calzaEtapa;
  });

  listaEl.innerHTML = filtrados.length
    ? filtrados.map((c) => `
        <li>
          <a href="cliente.html?id=${c.id}">${c.nombre}</a>
          <span class="etapa">${ETIQUETAS_ETAPA[c.etapa] ?? c.etapa}</span>
        </li>
      `).join('')
    : '<li>Sin resultados.</li>';
}

buscadorEl.addEventListener('input', renderizarLista);
filtroEtapaEl.addEventListener('change', renderizarLista);

// Si ya había una sesión activa (magic link ya usado antes), mostrar la app directo.
const { data: { session } } = await supabase.auth.getSession();
if (session) mostrarApp();
