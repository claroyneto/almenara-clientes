import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirAccion } from '../functions/_lib/comandos.js';

test('/start responde la ayuda sin tocar estado', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/start' }, estado: null });
  assert.match(accion.respuesta.texto, /\/nuevo/);
  assert.equal(accion.nuevoEstado, undefined);
});

test('/clientes sin clientes registrados avisa que no hay nada', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/clientes' }, estado: null, clientesRecientes: [] });
  assert.match(accion.respuesta.texto, /no hay clientes/i);
});

test('/clientes con datos lista nombre y etapa', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'comando', valor: '/clientes' }, estado: null,
    clientesRecientes: [{ id: '1', nombre: 'Fuegos del Sur', etapa: 'cliente' }]
  });
  assert.match(accion.respuesta.texto, /Fuegos del Sur/);
  assert.match(accion.respuesta.texto, /Cliente/);
});

test('/nuevo pide el nombre y arranca el flujo', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/nuevo' }, estado: null });
  assert.equal(accion.nuevoEstado.paso, 'nuevo_nombre');
  assert.match(accion.respuesta.texto, /nombre/i);
});

test('flujo /nuevo completo sin duplicado: nombre -> rubro -> etapa -> guarda', () => {
  const paso1 = decidirAccion({
    entrada: { tipo: 'texto', valor: 'Cliente Nuevo' },
    estado: { paso: 'nuevo_nombre', datosParciales: {} },
    clienteDuplicado: null
  });
  assert.equal(paso1.nuevoEstado.paso, 'nuevo_rubro');
  assert.equal(paso1.nuevoEstado.datosParciales.nombre, 'Cliente Nuevo');

  const paso2 = decidirAccion({
    entrada: { tipo: 'texto', valor: 'Agro' },
    estado: { paso: 'nuevo_rubro', datosParciales: { nombre: 'Cliente Nuevo' } }
  });
  assert.equal(paso2.nuevoEstado.paso, 'nuevo_etapa');
  assert.ok(paso2.respuesta.botones.some((b) => b.valor === 'etapa:prospecto'));

  const paso3 = decidirAccion({
    entrada: { tipo: 'boton', valor: 'etapa:prospecto' },
    estado: { paso: 'nuevo_etapa', datosParciales: { nombre: 'Cliente Nuevo', rubro: 'Agro' } }
  });
  assert.deepEqual(paso3.guardarCliente, { nombre: 'Cliente Nuevo', rubro: 'Agro', etapa: 'prospecto' });
  assert.equal(paso3.cancelarEstado, true);
});

test('/nuevo con nombre duplicado pregunta antes de crear, y "es el mismo" redirige a /nota', () => {
  const pregunta = decidirAccion({
    entrada: { tipo: 'texto', valor: 'fuegos del sur' },
    estado: { paso: 'nuevo_nombre', datosParciales: {} },
    clienteDuplicado: { id: 'c1', nombre: 'Fuegos del Sur', etapa: 'cliente' }
  });
  assert.equal(pregunta.nuevoEstado.paso, 'nuevo_confirmar_duplicado');
  assert.match(pregunta.respuesta.texto, /Ya existe un cliente llamado Fuegos del Sur/);

  const esElMismo = decidirAccion({
    entrada: { tipo: 'boton', valor: 'dup_si' },
    estado: { paso: 'nuevo_confirmar_duplicado', datosParciales: { nombre: 'fuegos del sur', duplicadoId: 'c1' } }
  });
  assert.equal(esElMismo.nuevoEstado.paso, 'nota_texto');
  assert.equal(esElMismo.nuevoEstado.datosParciales.clienteId, 'c1');
});

test('/nuevo con nombre duplicado, "es otro distinto" sigue el flujo normal', () => {
  const esOtro = decidirAccion({
    entrada: { tipo: 'boton', valor: 'dup_no' },
    estado: { paso: 'nuevo_confirmar_duplicado', datosParciales: { nombre: 'Otro Fuegos', duplicadoId: 'c1' } }
  });
  assert.equal(esOtro.nuevoEstado.paso, 'nuevo_rubro');
  assert.equal(esOtro.nuevoEstado.datosParciales.nombre, 'Otro Fuegos');
});

test('/nota con pocos clientes muestra botones', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'comando', valor: '/nota' }, estado: null,
    clientesRecientes: [{ id: '1', nombre: 'A', etapa: 'cliente' }, { id: '2', nombre: 'B', etapa: 'prospecto' }]
  });
  assert.equal(accion.nuevoEstado.paso, 'nota_elegir_cliente');
  assert.equal(accion.respuesta.botones.length, 2);
});

test('/nota sin clientes avisa que hay que usar /nuevo primero', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/nota' }, estado: null, clientesRecientes: [] });
  assert.match(accion.respuesta.texto, /\/nuevo/);
});

test('elegir cliente por botón en /nota pasa a pedir el texto de la nota', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'boton', valor: 'nota_cliente:c1' },
    estado: { paso: 'nota_elegir_cliente', datosParciales: {} }
  });
  assert.equal(accion.nuevoEstado.paso, 'nota_texto');
  assert.equal(accion.nuevoEstado.datosParciales.clienteId, 'c1');
});

test('escribir el texto de la nota la guarda y cierra el flujo', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'texto', valor: 'Pidió cotización, enviar el jueves' },
    estado: { paso: 'nota_texto', datosParciales: { clienteId: 'c1' } }
  });
  assert.deepEqual(accion.guardarNota, { clienteId: 'c1', texto: 'Pidió cotización, enviar el jueves' });
  assert.equal(accion.cancelarEstado, true);
});

test('/cancelar con un flujo pendiente lo cancela', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'comando', valor: '/cancelar' },
    estado: { paso: 'nuevo_nombre', datosParciales: {} }
  });
  assert.equal(accion.cancelarEstado, true);
});

test('/cancelar sin nada pendiente lo dice explícito', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/cancelar' }, estado: null });
  assert.match(accion.respuesta.texto, /nada pendiente/i);
});

test('un texto suelto sin flujo activo sugiere /nota o /nuevo, no adivina', () => {
  const accion = decidirAccion({ entrada: { tipo: 'texto', valor: 'hola' }, estado: null });
  assert.match(accion.respuesta.texto, /\/nota|\/nuevo/);
  assert.equal(accion.guardarCliente, undefined);
  assert.equal(accion.guardarNota, undefined);
});
