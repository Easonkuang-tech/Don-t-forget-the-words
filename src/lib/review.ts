import type {
  Card,
  ReviewMode,
  ReviewQuestion,
  SessionMode
} from "../types";

const FALLBACK_MEANINGS = [
  "与该词无关的含义",
  "表示地点或时间的词",
  "表示否定的连接词",
  "表示数量的形容词",
  "表示动作完成的副词",
  "表示个人态度的名词"
];

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function chooseTextAnswer(card: Card): string {
  const answer = card.chinese
    .split(/[\n|；;，,、]+/)
    .map((item) => item.trim())
    .find(Boolean);
  return answer ?? card.chinese.trim() ?? card.english;
}

function supportsCloze(card: Card): boolean {
  const sentence = card.sentence.trim();
  const target = card.target.trim() || card.english.trim();
  return Boolean(sentence && target && sentence.toLocaleLowerCase().includes(target.toLocaleLowerCase()));
}

function buildCloze(card: Card): ReviewQuestion["cloze"] {
  const sentence = card.sentence.trim();
  const target = (card.target.trim() || card.english.trim()).trim();
  const index = sentence
    .toLocaleLowerCase("en")
    .indexOf(target.toLocaleLowerCase("en"));

  if (index < 0) {
    return null;
  }

  return {
    before: sentence.slice(0, index),
    target: sentence.slice(index, index + target.length),
    after: sentence.slice(index + target.length)
  };
}

function assignModes(cards: Card[], mode: SessionMode, random: () => number): ReviewMode[] {
  if (mode !== "mixed") {
    return cards.map((card) => {
      if (mode === "cloze" && !supportsCloze(card)) {
        return "typing";
      }
      return mode;
    });
  }

  const availableModes: ReviewMode[] = ["cloze", "typing", "choice"];
  const baseCount = Math.floor(cards.length / availableModes.length);
  const remainder = cards.length % availableModes.length;
  const tokens = availableModes.flatMap((item) =>
    Array.from({ length: baseCount }, () => item)
  );

  for (let index = 0; index < remainder; index += 1) {
    tokens.push(availableModes[index]);
  }

  return shuffle(tokens, random).map((token, index) => {
    if (token === "cloze" && !supportsCloze(cards[index])) {
      return "typing";
    }
    return token;
  });
}

function balancedCorrectPositions(
  count: number,
  random: () => number
): number[] {
  const positions = Array.from({ length: count }, (_, index) => index % 4);
  return shuffle(positions, random);
}

function buildChoiceOptions(
  card: Card,
  allCards: Card[],
  correctIndex: number,
  random: () => number
): string[] {
  const correct = chooseTextAnswer(card);
  const seen = new Set([correct]);
  const sameDeck = shuffle(
    allCards.filter(
      (candidate) =>
        candidate.id !== card.id &&
        candidate.deckId === card.deckId
    ),
    random
  );
  const otherDecks = shuffle(
    allCards.filter(
      (candidate) =>
        candidate.id !== card.id &&
        candidate.deckId !== card.deckId
    ),
    random
  );

  const distractors: string[] = [];
  for (const candidate of [...sameDeck, ...otherDecks]) {
    const meaning = chooseTextAnswer(candidate);
    if (meaning && !seen.has(meaning)) {
      seen.add(meaning);
      distractors.push(meaning);
    }
    if (distractors.length === 3) {
      break;
    }
  }

  for (const fallback of FALLBACK_MEANINGS) {
    if (distractors.length === 3) {
      break;
    }
    if (!seen.has(fallback)) {
      seen.add(fallback);
      distractors.push(fallback);
    }
  }

  const options = shuffle(distractors, random).slice(0, 3);
  options.splice(correctIndex, 0, correct);
  return options;
}

export function buildReviewQuestions(
  cards: Card[],
  allCards: Card[],
  mode: SessionMode,
  random: () => number = Math.random
): ReviewQuestion[] {
  const modes = assignModes(cards, mode, random);
  const choiceCount = modes.filter((item) => item === "choice").length;
  const positions = balancedCorrectPositions(choiceCount, random);
  let choiceIndex = 0;

  return cards.map((card, index) => {
    const reviewMode = modes[index];
    const correctOptionIndex =
      reviewMode === "choice" ? positions[choiceIndex++] : -1;

    return {
      id: `${card.id}:${reviewMode}:${index}`,
      card,
      mode: reviewMode,
      cloze: reviewMode === "cloze" ? buildCloze(card) : null,
      options:
        reviewMode === "choice"
          ? buildChoiceOptions(
              card,
              allCards,
              correctOptionIndex,
              random
            )
          : [],
      correctOptionIndex
    };
  });
}
