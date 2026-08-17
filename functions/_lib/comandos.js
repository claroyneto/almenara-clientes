const ETAPAS = [
  { valor: 'prospecto', etiqueta: 'Prospecto' },
  { valor: 'diagnostico', etiqueta: 'Diagnóstico' },
  { valor: 'cliente', etiqueta: 'Cliente' },
  { valor: 'descartado', etiqueta: 'Descartado' }
];

const MAX_BOTONES_CLIENTES = 8;

function etiquetaEtapa(valor) {
  return ETAPAS.find((e) => e.valor === valor)?.etiqueta ?? valor;
}

// Decide qué responder y qué guardar, dado el mensaje/botón entrante y el
// contexto ya cargado por quien llama (spec §5: flujo de /nuevo y /nota).
// Función pura: sin fetch, sin Supabase — todo lo que necesita ya viene
// como parámetro, por eso es 100% testeable sin mocks.
export function decidirAccion({ entrada, estado, clienteDuplicado, clientesRecientes }) {
  const paso = estado?.paso ?? null;
  const datosParciales = estado?.datosParciales ?? {};

  if (entrada.tipo === 'comando' && entrada.valor === '/cancelar') {
    if (!paso) return { respuesta: { texto: 'No hay nada pendiente que cancelar.' } };
    return { respuesta: { texto: 'Cancelado.' }, cancelarEstado: true };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/start') {
    return {
      respuesta: {
        texto: 'Hola! Comandos:\n/nuevo — registrar un cliente o prospecto\n/nota — agregar una nota a uno existente\n/clientes — ver la lista\n/cancelar — cancelar lo que estabas haciendo'
      }
    };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/clientes') {
    if (!clientesRecientes?.length) return { respuesta: { texto: 'Todavía no hay clientes registrados. Usa /nuevo para el primero.' } };
    const lineas = clientesRecientes.map((c) => `• ${c.nombre} — ${etiquetaEtapa(c.etapa)}`);
    return { respuesta: { texto: lineas.join('\n') } };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/nuevo') {
    return {
      respuesta: { texto: '¿Cuál es el nombre del cliente o prospecto?' },
      nuevoEstado: { paso: 'nuevo_nombre', datosParciales: {} }
    };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/nota') {
    if (!clientesRecientes?.length) return { respuesta: { texto: 'No hay clientes todavía — usa /nuevo primero.' } };
    if (clientesRecientes.length <= MAX_BOTONES_CLIENTES) {
      return {
        respuesta: {
          texto: '¿A qué cliente le agregas la nota?',
          botones: clientesRecientes.map((c) => ({ etiqueta: c.nombre, valor: `nota_cliente:${c.id}` }))
        },
        nuevoEstado: { paso: 'nota_elegir_cliente', datosParciales: {} }
      };
    }
    return {
      respuesta: { texto: 'Escribe el nombre exacto del cliente:' },
      nuevoEstado: { paso: 'nota_buscar_cliente', datosParciales: {} }
    };
  }

  if (paso === 'nuevo_nombre' && entrada.tipo === 'texto') {
    if (clienteDuplicado) {
      return {
        respuesta: {
          texto: `Ya existe un cliente llamado ${clienteDuplicado.nombre} (etapa: ${etiquetaEtapa(clienteDuplicado.etapa)}). ¿Es el mismo?`,
          botones: [
            { etiqueta: 'Sí, es el mismo', valor: 'dup_si' },
            { etiqueta: 'No, es otro distinto', valor: 'dup_no' }
          ]
        },
        nuevoEstado: { paso: 'nuevo_confirmar_duplicado', datosParciales: { nombre: entrada.valor, duplicadoId: clienteDuplicado.id } }
      };
    }
    return {
      respuesta: { texto: '¿Cuál es su rubro?' },
      nuevoEstado: { paso: 'nuevo_rubro', datosParciales: { nombre: entrada.valor } }
    };
  }

  if (paso === 'nuevo_confirmar_duplicado' && entrada.tipo === 'boton') {
    if (entrada.valor === 'dup_si') {
      return {
        respuesta: { texto: 'Dale, agreguemos la nota a ese cliente. Escribe la nota:' },
        nuevoEstado: { paso: 'nota_texto', datosParciales: { clienteId: datosParciales.duplicadoId } }
      };
    }
    if (entrada.valor === 'dup_no') {
      return {
        respuesta: { texto: '¿Cuál es su rubro?' },
        nuevoEstado: { paso: 'nuevo_rubro', datosParciales: { nombre: datosParciales.nombre } }
      };
    }
    return { respuesta: { texto: 'No entendí — usa uno de los botones de arriba.' } };
  }

  if (paso === 'nuevo_rubro' && entrada.tipo === 'texto') {
    return {
      respuesta: { texto: '¿En qué etapa está?', botones: ETAPAS.map((e) => ({ etiqueta: e.etiqueta, valor: `etapa:${e.valor}` })) },
      nuevoEstado: { paso: 'nuevo_etapa', datosParciales: { ...datosParciales, rubro: entrada.valor } }
    };
  }

  if (paso === 'nuevo_etapa' && entrada.tipo === 'boton' && entrada.valor.startsWith('etapa:')) {
    const etapa = entrada.valor.slice('etapa:'.length);
    return {
      respuesta: { texto: `Listo, ${datosParciales.nombre} queda registrado como ${etiquetaEtapa(etapa)}.` },
      guardarCliente: { nombre: datosParciales.nombre, rubro: datosParciales.rubro, etapa },
      cancelarEstado: true
    };
  }

  if (paso === 'nota_elegir_cliente' && entrada.tipo === 'boton' && entrada.valor.startsWith('nota_cliente:')) {
    return {
      respuesta: { texto: 'Escribe la nota:' },
      nuevoEstado: { paso: 'nota_texto', datosParciales: { clienteId: entrada.valor.slice('nota_cliente:'.length) } }
    };
  }

  if (paso === 'nota_buscar_cliente' && entrada.tipo === 'texto') {
    if (!clienteDuplicado) return { respuesta: { texto: 'No encontré ese cliente. Prueba de nuevo o usa /cancelar.' } };
    return {
      respuesta: { texto: 'Escribe la nota:' },
      nuevoEstado: { paso: 'nota_texto', datosParciales: { clienteId: clienteDuplicado.id } }
    };
  }

  if (paso === 'nota_texto' && entrada.tipo === 'texto') {
    return {
      respuesta: { texto: 'Nota guardada.' },
      guardarNota: { clienteId: datosParciales.clienteId, texto: entrada.valor },
      cancelarEstado: true
    };
  }

  if (!paso) {
    return { respuesta: { texto: 'No entendí. Usa /nota para agregar una nota o /nuevo para registrar un cliente.' } };
  }

  return { respuesta: { texto: 'No entendí esa respuesta. Usa /cancelar si quieres empezar de nuevo.' } };
}
