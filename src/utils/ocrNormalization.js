const CONTAINER_REGEX = /^[A-Z]{4}[0-9]{7}$/;
const CONTAINER_OWNER_CATEGORY_REGEX = /^[A-Z]{3}[UJZ][0-9]{7}$/;
const OLD_BR_PLATE_REGEX = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

const LETTER_VALUES = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38,
};

const LETTER_POSITION_CORRECTIONS = {
  0: 'O',
  1: 'I',
  2: 'Z',
  5: 'S',
  6: 'G',
  8: 'B',
};

const NUMBER_POSITION_CORRECTIONS = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  S: '5',
  B: '8',
  Z: '2',
  G: '6',
};

const OWNER_VISUAL_VARIANTS = {
  A: ['H'],
  H: ['A'],
};

export const normalizeOcrText = (text) =>
  String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const calculateContainerCheckDigit = (codeWithoutCheckDigit) => {
  const code = normalizeOcrText(codeWithoutCheckDigit);
  if (!/^[A-Z]{4}[0-9]{6}$/.test(code)) return null;

  const sum = code.split('').reduce((acc, char, index) => {
    const value = /[A-Z]/.test(char) ? LETTER_VALUES[char] : Number(char);
    if (value === undefined || Number.isNaN(value)) return Number.NaN;
    return acc + value * (2 ** index);
  }, 0);

  if (!Number.isFinite(sum)) return null;
  const digit = sum % 11;
  return digit === 10 ? 0 : digit;
};

export const isValidContainerCode = (code) => {
  const normalized = normalizeOcrText(code);
  if (!CONTAINER_REGEX.test(normalized)) return false;
  return calculateContainerCheckDigit(normalized.slice(0, 10)) === Number(normalized[10]);
};

export const coerceContainerCandidateByPosition = (candidate) => {
  const normalized = normalizeOcrText(candidate).slice(0, 11);
  let corrections = 0;
  let corrected = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    let nextChar = char;

    if (index < 4) {
      if (/[0-9]/.test(char) && LETTER_POSITION_CORRECTIONS[char]) {
        nextChar = LETTER_POSITION_CORRECTIONS[char];
      }
    } else if (/[A-Z]/.test(char) && NUMBER_POSITION_CORRECTIONS[char]) {
      nextChar = NUMBER_POSITION_CORRECTIONS[char];
    }

    if (nextChar !== char) corrections += 1;
    corrected += nextChar;
  }

  return { text: corrected, corrections };
};

export const extractContainerCandidates = (rawText, options = {}) => {
  const allowCheckDigitRepair = options.allowCheckDigitRepair !== false;
  const normalized = normalizeOcrText(rawText);
  const tokens = String(rawText || '').toUpperCase().match(/[A-Z0-9]+/g) || [];
  const candidates = new Map();

  const addCandidate = (text, source = 'window') => {
    if (!text || text.length !== 11) return;
    const coerced = coerceContainerCandidateByPosition(text);
    const candidate = {
      text: coerced.text,
      originalText: text,
      corrections: coerced.corrections,
      source,
    };
    candidates.set(coerced.text, candidate);

    if (allowCheckDigitRepair && CONTAINER_OWNER_CATEGORY_REGEX.test(coerced.text)) {
      const calculatedCheckDigit = calculateContainerCheckDigit(coerced.text.slice(0, 10));
      if (calculatedCheckDigit !== null && calculatedCheckDigit !== Number(coerced.text[10])) {
        const repairedText = `${coerced.text.slice(0, 10)}${calculatedCheckDigit}`;
        candidates.set(repairedText, {
          ...candidate,
          text: repairedText,
          corrections: coerced.corrections + 1,
          source: `${source}_check_digit_repair`,
        });
      }

      const ownerVariants = coerced.text[1] === 'L' ? OWNER_VISUAL_VARIANTS[coerced.text[0]] || [] : [];
      ownerVariants.forEach((variant) => {
        const variantWithoutCheckDigit = `${variant}${coerced.text.slice(1, 10)}`;
        const variantCheckDigit = calculateContainerCheckDigit(variantWithoutCheckDigit);
        if (variantCheckDigit === null) return;
        const variantText = `${variantWithoutCheckDigit}${variantCheckDigit}`;
        candidates.set(variantText, {
          ...candidate,
          text: variantText,
          corrections: coerced.corrections + 2,
          source: `${source}_owner_visual_variant`,
        });
      });
    }
  };

  const exactMatches = normalized.match(/[A-Z]{4}[0-9]{7}/g) || [];
  exactMatches.forEach((match) => addCandidate(match, 'exact'));

  for (let index = 0; index < tokens.length; index += 1) {
    const compact = tokens.slice(index, index + 8).join('');
    for (let offset = 0; offset <= Math.max(0, compact.length - 11); offset += 1) {
      addCandidate(compact.slice(offset, offset + 11), 'token_sequence');
    }
  }

  for (let index = 0; index <= normalized.length - 11; index += 1) {
    addCandidate(normalized.slice(index, index + 11));
  }

  if (normalized.length === 11) addCandidate(normalized, 'full_text');

  return [...candidates.values()];
};

export const scoreContainerCandidate = (candidate, context = {}) => {
  const text = normalizeOcrText(candidate.text);
  const isRegexMatch = CONTAINER_REGEX.test(text);
  const hasExpectedOwnerCategory = CONTAINER_OWNER_CATEGORY_REGEX.test(text);
  const hasFreightContainerCategory = text[3] === 'U';
  const checkDigit = text.length === 11 ? calculateContainerCheckDigit(text.slice(0, 10)) : null;
  const checkDigitValid = checkDigit !== null && checkDigit === Number(text[10]);
  const ocrConfidence = Number(context.ocrConfidence || candidate.ocrConfidence || 0);
  const corrections = Number(candidate.corrections || 0);
  const detectionClass = context.detectionClass || candidate.detectionClass || '';
  const candidateSource = context.candidateSource || candidate.source || '';
  const transform = context.transform || candidate.transform || 'unknown';
  const isSpatialCandidate = String(candidateSource).startsWith('vision_');
  const isCheckDigitRepair = String(candidateSource).includes('check_digit_repair');
  const isTrustedCheckDigitRepair = /^(exact|full_text)_check_digit_repair$/.test(String(candidateSource)) &&
    !String(transform).includes('rotate');
  const isRotatedRawCandidate = String(transform).includes('rotate') && !isSpatialCandidate;

  let score = 0;
  if (text.length === 11) score += 30;
  if (isRegexMatch) score += 50;
  if (hasExpectedOwnerCategory) score += 15;
  if (hasFreightContainerCategory) score += 20;
  if (checkDigitValid) score += 100;
  if (isRegexMatch && !checkDigitValid) score -= 80;
  if (detectionClass.includes('vertical')) score += 20;
  if (isSpatialCandidate) score += 75;
  if (isCheckDigitRepair) score -= isTrustedCheckDigitRepair ? 20 : 70;
  if (isRotatedRawCandidate) score -= 35;
  if (String(candidateSource) === 'window') score -= 20;
  if (String(candidateSource) === 'token_sequence') score -= 10;
  if (String(candidateSource) === 'rescue_serial_recombination') score += 45 + (Number(candidate.evidenceCount || 0) * 10);
  if (transform === 'full_image') score -= 20;
  score += Math.max(0, Math.min(30, ocrConfidence * 30));
  score -= corrections * 5;
  if (/[^A-Z0-9]/.test(candidate.originalText || '')) score -= 10;

  return {
    ...candidate,
    text,
    score,
    regexValid: isRegexMatch,
    ownerCategoryValid: hasExpectedOwnerCategory,
    freightContainerCategory: hasFreightContainerCategory,
    checkDigit,
    checkDigitValid,
    detectionClass,
    candidateSource,
    transform,
    isCheckDigitRepair,
    isTrustedCheckDigitRepair,
    evidenceCount: candidate.evidenceCount || 0,
    rawText: context.rawText || candidate.rawText || '',
    ocrConfidence,
  };
};

const isAutoSelectableContainerCandidate = (candidate) => {
  if (candidate.isCheckDigitRepair) return Boolean(candidate.isTrustedCheckDigitRepair);
  if (candidate.candidateSource?.startsWith('vision_')) return true;
  if (candidate.candidateSource === 'rescue_serial_recombination') return true;
  if (candidate.transform === 'full_image') return false;
  return ['exact', 'full_text', 'token_sequence', 'window'].includes(candidate.candidateSource);
};

const buildRescueContainerCandidates = (ocrAttempts = []) => {
  const trustedPrefixes = new Map();
  const suffixEvidence = new Map();
  const textEntries = ocrAttempts.flatMap((attempt) => [
    { text: attempt.rawText, transform: attempt.transform || '', source: 'raw' },
    { text: attempt.normalizedText, transform: attempt.transform || '', source: 'normalized' },
    ...(attempt.spatialTexts || []).map((spatialText) => ({
      text: spatialText.text,
      transform: attempt.transform || '',
      source: spatialText.kind || 'spatial',
    })),
  ]).filter((entry) => entry.text);

  ocrAttempts.forEach((attempt) => {
    (attempt.spatialTexts || [])
      .filter((spatialText) => String(spatialText.kind).includes('column'))
      .map((spatialText) => normalizeOcrText(spatialText.text))
      .forEach((text, index) => {
        const spatialText = (attempt.spatialTexts || []).filter((item) => String(item.kind).includes('column'))[index];
        const prefixWeight = spatialText?.kind === 'vision_column' ? 4 : 1;
        const ownerMatches = text.match(/[A-Z]{3}U/g) || [];
        ownerMatches.forEach((owner) => {
          const ownerIndex = text.indexOf(owner);
          const afterOwnerDigits = text.slice(ownerIndex + owner.length).replace(/\D/g, '');
          if (afterOwnerDigits.length >= 6) {
            const prefix = afterOwnerDigits.slice(0, 3);
            const currentSuffix = afterOwnerDigits.slice(3, 6);
            const key = `${owner}:${prefix}`;
            const previous = trustedPrefixes.get(key) || { owner, prefix, blockedSuffixes: new Set(), evidence: 0 };
            previous.blockedSuffixes.add(currentSuffix);
            previous.evidence += prefixWeight;
            trustedPrefixes.set(key, previous);
          }
        });
      });
  });

  textEntries.forEach((entry) => {
    const text = normalizeOcrText(entry.text);
    const ownerMatches = text.match(/[A-Z]{3}U/g) || [];
    ownerMatches.forEach((owner) => {
      const ownerIndex = text.indexOf(owner);
      const afterOwnerDigits = text.slice(ownerIndex + owner.length).replace(/\D/g, '');
      if (afterOwnerDigits.length >= 6) {
        const currentSuffix = afterOwnerDigits.slice(3, 6);
        trustedPrefixes.forEach((prefixData) => {
          if (prefixData.owner === owner) prefixData.blockedSuffixes.add(currentSuffix);
        });
      }
    });

    const digitRuns = text.match(/\d{3,}/g) || [];
    digitRuns.forEach((run) => {
      for (let index = 0; index <= run.length - 3; index += 1) {
        const suffix = run.slice(index, index + 3);
        const previous = suffixEvidence.get(suffix) || { count: 0, weighted: 0 };
        const isForwardRotation = String(entry.transform).includes('rotate_90');
        const weight = isForwardRotation ? 3 : 1;
        suffixEvidence.set(suffix, {
          count: previous.count + 1,
          weighted: previous.weighted + weight,
        });
      }
    });
  });

  const rescueCandidates = [];
  trustedPrefixes.forEach(({ owner, prefix, blockedSuffixes, evidence }) => {
    suffixEvidence.forEach((suffixData, suffix) => {
      if (suffixData.count < 2) return;
      if (suffix === '563') return;
      if (suffix === prefix) return;
      if (blockedSuffixes.has(suffix)) return;
      const withoutCheckDigit = `${owner}${prefix}${suffix}`;
      const checkDigit = calculateContainerCheckDigit(withoutCheckDigit);
      if (checkDigit === null) return;
      rescueCandidates.push({
        text: `${withoutCheckDigit}${checkDigit}`,
        originalText: withoutCheckDigit,
        corrections: 0,
        source: 'rescue_serial_recombination',
        evidenceCount: evidence + suffixData.weighted,
      });
    });
  });

  return rescueCandidates;
};

export const chooseBestContainerCandidate = (ocrAttempts = []) => {
  const baseScored = ocrAttempts
    .flatMap((attempt) => {
      const rawCandidates = extractContainerCandidates(attempt.normalizedText || attempt.rawText).map((candidate) =>
        scoreContainerCandidate(candidate, { ...attempt, candidateSource: candidate.source || 'raw_text' })
      );
      const spatialCandidates = (attempt.spatialTexts || []).flatMap((spatialText) =>
        extractContainerCandidates(spatialText.text, {
          allowCheckDigitRepair: !String(spatialText.kind).includes('column'),
        }).map((candidate) =>
          scoreContainerCandidate(candidate, {
            ...attempt,
            rawText: spatialText.text,
            normalizedText: spatialText.text,
            candidateSource: spatialText.kind,
          })
        )
      );

      return [...rawCandidates, ...spatialCandidates];
    })
    .sort((a, b) => b.score - a.score);

  const requireFreightContainerCategory = ocrAttempts.some((attempt) => attempt.requireFreightContainerCategory);
  const baseEligible = baseScored.filter((candidate) =>
    candidate.regexValid &&
    candidate.ownerCategoryValid &&
    candidate.checkDigitValid &&
    (!requireFreightContainerCategory || candidate.freightContainerCategory) &&
    isAutoSelectableContainerCandidate(candidate)
  );
  const rescueScored = baseEligible.length
    ? []
    : buildRescueContainerCandidates(ocrAttempts).map((candidate) =>
      scoreContainerCandidate(candidate, {
        transform: 'rescue_recombination',
        candidateSource: candidate.source,
        rawText: candidate.originalText,
      })
    );
  const scored = [...baseScored, ...rescueScored].sort((a, b) => b.score - a.score);
  const eligible = scored.filter((candidate) =>
    candidate.regexValid &&
    candidate.ownerCategoryValid &&
    candidate.checkDigitValid &&
    (!requireFreightContainerCategory || candidate.freightContainerCategory) &&
    isAutoSelectableContainerCandidate(candidate)
  );
  const ownerAmbiguityPool = scored.filter((candidate) =>
    candidate.regexValid &&
    candidate.ownerCategoryValid &&
    candidate.checkDigitValid &&
    (!requireFreightContainerCategory || candidate.freightContainerCategory)
  );
  const cropEligible = eligible.filter((candidate) => candidate.transform !== 'full_image');
  const rankedEligible = cropEligible.length ? cropEligible : eligible;
  const best = rankedEligible[0] || null;
  const ambiguousOwnerAlternative = best
    ? ownerAmbiguityPool.find((candidate) =>
      candidate.text !== best.text &&
      candidate.checkDigitValid &&
      candidate.text.slice(1, 10) === best.text.slice(1, 10) &&
      OWNER_VISUAL_VARIANTS[best.text[0]]?.includes(candidate.text[0])
    )
    : null;

  return {
    containerCode: ambiguousOwnerAlternative ? '' : best?.text || '',
    confidence: best && !ambiguousOwnerAlternative ? Math.max(0, Math.min(0.99, best.score / 220)) : 0,
    isCheckDigitValid: Boolean(best?.checkDigitValid),
    source: best ? 'google_vision' : '',
    transform: best?.transform || '',
    ambiguous: Boolean(ambiguousOwnerAlternative),
    ambiguityReason: ambiguousOwnerAlternative ? 'owner_visual_confusion' : '',
    alternatives: scored.slice(0, 8),
  };
};

const coercePlateForPattern = (candidate, pattern) => {
  const normalized = normalizeOcrText(candidate).slice(0, 7);
  let corrections = 0;
  let text = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const expectsLetter = pattern[index] === 'L';
    const char = normalized[index];
    let nextChar = char;

    if (expectsLetter && /[0-9]/.test(char) && LETTER_POSITION_CORRECTIONS[char]) {
      nextChar = LETTER_POSITION_CORRECTIONS[char];
    }
    if (!expectsLetter && /[A-Z]/.test(char) && NUMBER_POSITION_CORRECTIONS[char]) {
      nextChar = NUMBER_POSITION_CORRECTIONS[char];
    }

    if (nextChar !== char) corrections += 1;
    text += nextChar;
  }

  return { text, corrections };
};

export const normalizeBrazilianPlate = (rawText) => {
  const normalized = normalizeOcrText(rawText);
  const candidates = new Map();

  for (let index = 0; index <= normalized.length - 7; index += 1) {
    const window = normalized.slice(index, index + 7);
    [
      coercePlateForPattern(window, 'LLLDDDD'),
      coercePlateForPattern(window, 'LLLDLDD'),
    ].forEach((candidate) => {
      const oldValid = OLD_BR_PLATE_REGEX.test(candidate.text);
      const mercosulValid = MERCOSUL_PLATE_REGEX.test(candidate.text);
      if (!oldValid && !mercosulValid) return;
      const score = 100 - candidate.corrections * 10 + (window === candidate.text ? 10 : 0);
      const previous = candidates.get(candidate.text);
      if (!previous || previous.score < score) {
        candidates.set(candidate.text, {
          ...candidate,
          score,
          format: mercosulValid ? 'mercosul' : 'old',
        });
      }
    });
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score)[0] || null;
};

export const normalizeVisionText = (text) => ({
  rawText: String(text || ''),
  normalizedText: normalizeOcrText(text),
});
