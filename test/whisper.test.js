import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearTranscriptor } from '../functions/_lib/whisper.js';

test('transcribir devuelve el texto que responde la API', async () => {
  const fetchImpl = async (url, opciones) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(opciones.method, 'POST');
    assert.equal(opciones.headers.authorization, 'Bearer sk-test-123');
    return { ok: true, json: async () => ({ text: 'reunión buena, pidió cotización' }) };
  };
  const transcriptor = crearTranscriptor({ apiKey: 'sk-test-123', fetchImpl });
  const texto = await transcriptor.transcribir(new ArrayBuffer(8), 'audio/ogg');
  assert.equal(texto, 'reunión buena, pidió cotización');
});

test('manda el audio como multipart/form-data con el modelo y el idioma', async () => {
  let cuerpoRecibido;
  const fetchImpl = async (url, opciones) => {
    cuerpoRecibido = opciones.body;
    return { ok: true, json: async () => ({ text: 'ok' }) };
  };
  const transcriptor = crearTranscriptor({ apiKey: 'sk-test', fetchImpl });
  await transcriptor.transcribir(new ArrayBuffer(8), 'audio/ogg');

  assert.ok(cuerpoRecibido instanceof FormData);
  assert.equal(cuerpoRecibido.get('model'), 'whisper-1');
  assert.equal(cuerpoRecibido.get('language'), 'es');
  assert.ok(cuerpoRecibido.get('file') instanceof Blob);
});

test('si la API rechaza la llamada, lanza un error con el detalle', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"error":"invalid api key"}' });
  const transcriptor = crearTranscriptor({ apiKey: 'sk-invalida', fetchImpl });
  await assert.rejects(
    () => transcriptor.transcribir(new ArrayBuffer(8), 'audio/ogg'),
    /Whisper rechazó la transcripción \(HTTP 401\)/
  );
});

test('si la respuesta no trae texto, devuelve string vacío en vez de undefined', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
  const transcriptor = crearTranscriptor({ apiKey: 'sk-test', fetchImpl });
  const texto = await transcriptor.transcribir(new ArrayBuffer(8), 'audio/ogg');
  assert.equal(texto, '');
});

test('manda un signal de timeout -- un audio o red colgada no debe congelar el bot para siempre', async () => {
  const fetchImpl = async (url, opciones) => {
    assert.ok(opciones.signal instanceof AbortSignal, 'debe mandar un AbortSignal');
    return { ok: true, json: async () => ({ text: 'ok' }) };
  };
  const transcriptor = crearTranscriptor({ apiKey: 'sk-test', fetchImpl });
  await transcriptor.transcribir(new ArrayBuffer(8), 'audio/ogg');
});

test('un mimeType que no es audio/ogg lanza en vez de mandar un archivo que Whisper rechazaría igual', async () => {
  const transcriptor = crearTranscriptor({ apiKey: 'sk-test', fetchImpl: async () => ({}) });
  await assert.rejects(
    () => transcriptor.transcribir(new ArrayBuffer(8), 'audio/mp3'),
    /formato de audio no soportado.*audio\/mp3/i
  );
});
