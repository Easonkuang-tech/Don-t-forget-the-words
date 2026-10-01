function normalizeEnglish(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeChinese(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]【】—_-]/g, "")
    .trim();
}

function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (!left.length) {
    return right.length;
  }
  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function matchEnglishAnswer(answer: string, expected: string): boolean {
  const normalizedAnswer = normalizeEnglish(answer);
  const normalizedExpected = normalizeEnglish(expected);
  if (!normalizedAnswer || !normalizedExpected) {
    return false;
  }
  if (normalizedAnswer === normalizedExpected) {
    return true;
  }

  if (normalizedExpected.length >= 5 && normalizedAnswer.length >= 5) {
    return levenshtein(normalizedAnswer, normalizedExpected) <= 1;
  }

  return false;
}

export function chineseCandidates(expected: string): string[] {
  return expected
    .split(/[\n|/；;，,、]+/)
    .map((item) => normalizeChinese(item))
    .filter(Boolean);
}

export function matchChineseAnswer(answer: string, expected: string): boolean {
  const normalizedAnswer = normalizeChinese(answer);
  if (!normalizedAnswer) {
    return false;
  }

  const candidates = chineseCandidates(expected);
  return candidates.some((candidate) => {
    if (candidate === normalizedAnswer) {
      return true;
    }
    if (candidate.length >= 2 && normalizedAnswer.includes(candidate)) {
      return true;
    }
    if (normalizedAnswer.length >= 2 && candidate.includes(normalizedAnswer)) {
      return true;
    }
    return false;
  });
}
