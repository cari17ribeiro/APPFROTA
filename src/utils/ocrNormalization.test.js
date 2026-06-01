import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateContainerCheckDigit,
  chooseBestContainerCandidate,
  extractContainerCandidates,
  isValidContainerCode,
  normalizeBrazilianPlate,
  normalizeOcrText,
} from './ocrNormalization.js';

test('normaliza texto OCR mantendo apenas letras e números em uppercase', () => {
  assert.equal(normalizeOcrText('M S O U\n704 632-2.'), 'MSOU7046322');
});

test('calcula e valida dígito verificador ISO 6346', () => {
  assert.equal(calculateContainerCheckDigit('CSQU305438'), 3);
  assert.equal(isValidContainerCode('CSQU3054383'), true);
  assert.equal(isValidContainerCode('CSQU3054384'), false);
});

test('corrige confusões comuns por posição antes de validar container', () => {
  const candidates = extractContainerCandidates('M S 0 U 7O4 63Z 6');

  assert.deepEqual(candidates[0], {
    text: 'MSOU7046326',
    originalText: 'MS0U7O463Z6',
    corrections: 3,
    source: 'full_text',
  });
  assert.equal(isValidContainerCode(candidates[0].text), true);
});

test('pontua melhor candidato com regex, vertical e check digit válido', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: 'MSOU7046322',
      normalizedText: 'MSOU7046322',
      transform: 'full_image',
      confidence: 0.9,
    },
    {
      rawText: 'M S 0 U 7O4 63Z 6',
      normalizedText: 'MS0U7O463Z6',
      transform: 'rotate_90_contrast',
      detectionClass: 'container_code_vertical',
      confidence: 0.9,
    },
  ]);

  assert.equal(result.containerCode, 'MSOU7046326');
  assert.equal(result.isCheckDigitValid, true);
  assert.equal(result.transform, 'rotate_90_contrast');
});

test('não escolhe texto misturado de frota/carreta fora do formato de container', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: '563 434 GJM2H72C',
      normalizedText: '563434GJM2H72C',
      transform: 'full_image',
      confidence: 0.95,
    },
  ]);

  assert.equal(result.containerCode, '');
  assert.equal(result.confidence, 0);
});

test('não escolhe container com categoria ISO inválida na quarta letra', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: 'JMZH7288380',
      normalizedText: 'JMZH7288380',
      transform: 'full_image',
      confidence: 0.95,
    },
  ]);

  assert.equal(result.containerCode, '');
});

test('prefere container vertical ISO válido em meio a frota e carreta', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: '563\nHAMU\n298\n434\n7\nGJM2H72C',
      normalizedText: '563HAMU2984347GJM2H72C',
      transform: 'rotate_90_contrast',
      detectionClass: 'container_code_vertical_heuristic',
      confidence: 0.86,
    },
  ]);

  assert.equal(result.containerCode, 'HAMU2984347');
  assert.equal(result.isCheckDigitValid, true);
});

test('corrige apenas o dígito verificador quando os 10 primeiros caracteres são plausíveis', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: 'MRSU3105294',
      normalizedText: 'MRSU3105294',
      transform: 'original',
      confidence: 0.9,
      requireFreightContainerCategory: true,
    },
  ]);

  assert.equal(result.containerCode, 'MRSU3105296');
  assert.equal(result.isCheckDigitValid, true);
});

test('não aplica reparo de dígito verificador em leitura vertical por coluna', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: '',
      normalizedText: '',
      spatialTexts: [{ kind: 'vision_column', text: 'HAMU2988431' }],
      transform: 'original',
      detectionClass: 'container_number',
      confidence: 0.9,
      requireFreightContainerCategory: true,
    },
  ]);

  assert.equal(result.containerCode, '');
  assert.equal(result.alternatives.some((candidate) => candidate.text === 'HAMU2988437'), false);
});

test('prefere candidato espacial de coluna vertical sobre falso positivo da imagem inteira', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: 'GJMZ4728432',
      normalizedText: 'GJMZ4728432',
      transform: 'full_image',
      confidence: 0.95,
    },
    {
      rawText: '563 GJM2H72',
      normalizedText: '563GJM2H72',
      spatialTexts: [{ kind: 'vision_column', text: 'HAMU2984347' }],
      transform: 'original',
      detectionClass: 'container_code_vertical_heuristic',
      confidence: 0.78,
    },
  ]);

  assert.equal(result.containerCode, 'HAMU2984347');
  assert.equal(result.isCheckDigitValid, true);
});

test('recombina prefixo vertical confiável com sufixo visto em outras tentativas', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: '563 HAMU 843 298 GJM 2H72 CCHINI',
      normalizedText: '563HAMU843298GJM2H72CCHINI',
      spatialTexts: [
        { kind: 'vision_column', text: 'HAMU298843GJM2H72CCHINI' },
        { kind: 'vision_symbol_column', text: 'HAMU892348GJM2H7CCHINI' },
      ],
      transform: 'full_image',
      confidence: 0.8,
      requireFreightContainerCategory: true,
    },
    {
      rawText: '788 1434 HAWH',
      normalizedText: '7881434HAWH',
      transform: 'rotate_90',
      confidence: 0.6,
      requireFreightContainerCategory: true,
    },
    {
      rawText: '843 469 HAVM',
      normalizedText: '843469HAVM',
      transform: 'rotate_90_contrast',
      confidence: 0.6,
      requireFreightContainerCategory: true,
    },
  ]);

  assert.equal(result.containerCode, 'HAMU2984347');
  assert.equal(result.isCheckDigitValid, true);
});

test('quando configurado para contêiner de carga, exige U na quarta letra', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: 'GJMZ4728432',
      normalizedText: 'GJMZ4728432',
      transform: 'original',
      confidence: 0.95,
      requireFreightContainerCategory: true,
    },
  ]);

  assert.equal(result.containerCode, '');
});

test('não preenche automaticamente quando A/H no prefixo gera dois containers válidos', () => {
  const result = chooseBestContainerCandidate([
    {
      rawText: 'ALBU3422882',
      normalizedText: 'ALBU3422882',
      transform: 'original',
      confidence: 0.94,
      requireFreightContainerCategory: true,
    },
  ]);

  assert.equal(result.containerCode, '');
  assert.equal(result.ambiguous, true);
  assert.equal(result.ambiguityReason, 'owner_visual_confusion');
  assert.equal(result.alternatives.some((candidate) => candidate.text === 'HLBU3422880'), true);
});

test('normaliza placas brasileiras antigas e Mercosul', () => {
  assert.equal(normalizeBrazilianPlate('ABC I234').text, 'ABC1234');
  assert.equal(normalizeBrazilianPlate('ABC IA23').text, 'ABC1A23');
});
