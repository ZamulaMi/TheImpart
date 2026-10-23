import { Article, SiteLanguage } from '../types';

/**
 * Normalizes text for search:
 * - Converts to lowercase
 * - Normalizes apostrophes and quotes
 * - Maps common Cyrillic <-> Latin homoglyphs so typos like English 'i' in Ukrainian or vice-versa match seamlessly
 * - Strips punctuation
 */
const HOMOGLYPHS_TO_CYRILLIC: Record<string, string> = {
  i: 'і',
  a: 'а',
  e: 'е',
  o: 'о',
  p: 'р',
  c: 'с',
  x: 'х',
  y: 'у',
};

export function normalizeHomoglyphs(str: string): string {
  return str.replace(/[iaeopcxy]/g, (ch) => HOMOGLYPHS_TO_CYRILLIC[ch] || ch);
}

export function cleanApostrophes(str: string): string {
  return str.replace(/['’ʼ`"]/g, '');
}

/**
 * Remove HTML tags from article content
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize string into clean words
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const cleaned = cleanApostrophes(text.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  if (!cleaned) return [];
  return cleaned.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Lightweight Ukrainian stemmer: strips grammatical endings (cases, numbers, adjectives, verbs)
 * Allows "архітектура", "архітектурі", "архітектурою", "архітектурний" to share common stem.
 */
export function stemUkrainian(word: string): string {
  if (word.length <= 3) return word;
  let w = word.toLowerCase();

  // Remove common adjective suffixes
  const adjSuffixes = [
    'іший', 'іша', 'іше', 'іші',
    'ського', 'ському', 'ських', 'ськими', 'ський', 'ська', 'ське', 'ські',
    'цького', 'цькому', 'цьких', 'цькими', 'цький', 'цька', 'цьке', 'цькі',
    'нного', 'нному', 'нних', 'нними', 'нний', 'нна', 'нне', 'нні',
  ];
  for (const suf of adjSuffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, -suf.length);
    }
  }

  // Remove common case and plural noun endings
  const nounSuffixes = [
    'ами', 'ями', 'ому', 'ему', 'ого', 'ього', 'ими', 'іми', 'их', 'іх',
    'ою', 'ею', 'єю', 'ові', 'еві', 'єві', 'ів', 'ей', 'ям', 'ам', 'ах', 'ях',
    'ий', 'ій', 'а', 'я', 'у', 'ю', 'і', 'и', 'е', 'є', 'о', 'ь',
  ];
  for (const suf of nounSuffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, -suf.length);
    }
  }

  return w;
}

/**
 * Lightweight English stemmer
 */
export function stemEnglish(word: string): string {
  if (word.length <= 3) return word;
  let w = word.toLowerCase();
  const suffixes = ['ingly', 'edly', 'ing', 'ed', 'ies', 'es', 's', 'ment', 'tion', 'able', 'ible', 'ive', 'al', 'ly'];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

export function stemWord(word: string): string {
  if (/[\u0400-\u04FF]/.test(word)) {
    return stemUkrainian(word);
  }
  return stemEnglish(word);
}

/**
 * Damerau-Levenshtein distance calculation (with transposition of adjacent characters)
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > 3) return Math.abs(al - bl);

  const matrix: number[][] = [];
  for (let i = 0; i <= al; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let min = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        min = Math.min(min, matrix[i - 2][j - 2] + 1);
      }

      matrix[i][j] = min;
    }
  }

  return matrix[al][bl];
}

export interface MatchScore {
  score: number;
  matchedTokensCount: number;
  totalTokensCount: number;
  hasExactPhrase: boolean;
  hasFuzzyMatch: boolean;
}

/**
 * Match a single query word against a candidate document word
 */
export function matchToken(
  queryWord: string,
  docWord: string
): { isMatch: boolean; score: number; isExact: boolean; isFuzzy: boolean } {
  const qClean = cleanApostrophes(queryWord.toLowerCase());
  const dClean = cleanApostrophes(docWord.toLowerCase());

  if (qClean === dClean) {
    return { isMatch: true, score: 100, isExact: true, isFuzzy: false };
  }

  // Normalized homoglyphs (handles 'i' vs 'і', etc.)
  const qNorm = normalizeHomoglyphs(qClean);
  const dNorm = normalizeHomoglyphs(dClean);

  if (qNorm === dNorm) {
    return { isMatch: true, score: 95, isExact: true, isFuzzy: false };
  }

  // Prefix match (if query word has at least 3 chars)
  if (qClean.length >= 3 && (dClean.startsWith(qClean) || dNorm.startsWith(qNorm))) {
    return { isMatch: true, score: 75, isExact: false, isFuzzy: false };
  }

  // Reverse prefix (query is longer than doc word)
  if (dClean.length >= 4 && (qClean.startsWith(dClean) || qNorm.startsWith(dNorm))) {
    return { isMatch: true, score: 65, isExact: false, isFuzzy: false };
  }

  // Stem match (Ukrainian/English grammatical forms)
  const qStem = stemWord(qNorm);
  const dStem = stemWord(dNorm);
  if (qStem === dStem && qStem.length >= 3) {
    return { isMatch: true, score: 85, isExact: false, isFuzzy: false };
  }
  if (qStem.length >= 3 && dStem.length >= 3 && (dStem.startsWith(qStem) || qStem.startsWith(dStem))) {
    return { isMatch: true, score: 70, isExact: false, isFuzzy: false };
  }

  // Damerau-Levenshtein typo tolerance
  // Allowed errors:
  // length <= 3: 0 errors
  // length 4..5: 1 error
  // length 6..8: 1 or 2 errors
  // length >= 9: 2 errors
  const qLen = qNorm.length;
  const dLen = dNorm.length;

  if (qLen >= 4 && Math.abs(qLen - dLen) <= 2) {
    const dist = damerauLevenshtein(qNorm, dNorm);
    const maxAllowedDist = qLen <= 5 ? 1 : 2;

    if (dist <= maxAllowedDist) {
      const typoScore = dist === 1 ? 60 : 40;
      return { isMatch: true, score: typoScore, isExact: false, isFuzzy: true };
    }
  }

  // Also check distance between stems if both are at least 4 characters
  if (qStem.length >= 4 && dStem.length >= 4 && Math.abs(qStem.length - dStem.length) <= 1) {
    const stemDist = damerauLevenshtein(qStem, dStem);
    if (stemDist === 1) {
      return { isMatch: true, score: 50, isExact: false, isFuzzy: true };
    }
  }

  return { isMatch: false, score: 0, isExact: false, isFuzzy: false };
}

/**
 * Score an article against a query
 */
export function scoreArticle(
  article: Article,
  rawQuery: string,
  lang: SiteLanguage
): MatchScore | null {
  const isEn = lang === 'en';

  // Published filter
  if (isEn) {
    const isPubEn = article.publishedEn === true || String(article.publishedEn) === 'true';
    if (!isPubEn || !article.titleEn?.trim()) return null;
  } else {
    const isPub =
      article.published === true ||
      String(article.published) === 'true' ||
      (article.published as any) === 1;
    if (!isPub) return null;
  }

  const queryTrimmed = rawQuery.trim();
  if (!queryTrimmed) return null;

  const queryTokens = tokenize(queryTrimmed);
  if (queryTokens.length === 0) return null;

  const title = (isEn ? article.titleEn : article.title) || '';
  const excerpt = (isEn ? article.excerptEn : article.excerpt) || '';
  const content = stripHtml((isEn ? article.contentEn : article.content) || '');

  const categories = (
    isEn
      ? article.categoriesEn && article.categoriesEn.length > 0
        ? article.categoriesEn
        : article.categoryEn
        ? [article.categoryEn]
        : article.categories || [article.category]
      : article.categories && article.categories.length > 0
      ? article.categories
      : article.category
      ? [article.category]
      : []
  )
    .filter(Boolean)
    .map((c: any) => (typeof c === 'string' ? c : c?.name || String(c)))
    .join(' ');

  const topics = (
    isEn
      ? article.topicsEn && article.topicsEn.length > 0
        ? article.topicsEn
        : article.topics || []
      : article.topics || []
  ).join(' ');

  const qLower = cleanApostrophes(queryTrimmed.toLowerCase());
  const qNorm = normalizeHomoglyphs(qLower);

  const tLower = cleanApostrophes(title.toLowerCase());
  const tNorm = normalizeHomoglyphs(tLower);

  const eLower = cleanApostrophes(excerpt.toLowerCase());
  const eNorm = normalizeHomoglyphs(eLower);

  const catLower = cleanApostrophes(categories.toLowerCase());
  const catNorm = normalizeHomoglyphs(catLower);

  const cLower = cleanApostrophes(content.toLowerCase());
  const cNorm = normalizeHomoglyphs(cLower);

  let totalScore = 0;
  let hasExactPhrase = false;
  let hasFuzzyMatch = false;

  // 1. Direct whole-query substring matching
  if (tLower.includes(qLower) || tNorm.includes(qNorm)) {
    totalScore += 2000;
    hasExactPhrase = true;
  }
  if (eLower.includes(qLower) || eNorm.includes(qNorm)) {
    totalScore += 800;
    hasExactPhrase = true;
  }
  if (catLower.includes(qLower) || catNorm.includes(qNorm)) {
    totalScore += 700;
    hasExactPhrase = true;
  }
  if (cLower.includes(qLower) || cNorm.includes(qNorm)) {
    totalScore += 400;
    hasExactPhrase = true;
  }

  // 2. Tokenize document fields
  const titleTokens = tokenize(title);
  const excerptTokens = tokenize(excerpt);
  const catTokens = tokenize(`${categories} ${topics}`);
  const contentTokens = tokenize(content);

  let matchedTokensCount = 0;

  for (const qToken of queryTokens) {
    let bestTokenScore = 0;
    let tokenMatched = false;
    let tokenFuzzy = false;

    // Check title tokens (highest weight: 4.0x)
    for (const dToken of titleTokens) {
      const match = matchToken(qToken, dToken);
      if (match.isMatch) {
        const s = match.score * 4.0;
        if (s > bestTokenScore) {
          bestTokenScore = s;
          tokenMatched = true;
          tokenFuzzy = match.isFuzzy;
        }
      }
    }

    // Check category/topic tokens (weight: 2.5x)
    for (const dToken of catTokens) {
      const match = matchToken(qToken, dToken);
      if (match.isMatch) {
        const s = match.score * 2.5;
        if (s > bestTokenScore) {
          bestTokenScore = s;
          tokenMatched = true;
          tokenFuzzy = match.isFuzzy;
        }
      }
    }

    // Check excerpt tokens (weight: 2.0x)
    for (const dToken of excerptTokens) {
      const match = matchToken(qToken, dToken);
      if (match.isMatch) {
        const s = match.score * 2.0;
        if (s > bestTokenScore) {
          bestTokenScore = s;
          tokenMatched = true;
          tokenFuzzy = match.isFuzzy;
        }
      }
    }

    // Check content tokens (weight: 1.0x)
    if (bestTokenScore < 80) {
      for (const dToken of contentTokens) {
        const match = matchToken(qToken, dToken);
        if (match.isMatch) {
          const s = match.score * 1.0;
          if (s > bestTokenScore) {
            bestTokenScore = s;
            tokenMatched = true;
            tokenFuzzy = match.isFuzzy;
          }
          if (match.isExact) break;
        }
      }
    }

    if (tokenMatched) {
      matchedTokensCount++;
      totalScore += bestTokenScore;
      if (tokenFuzzy) hasFuzzyMatch = true;
    }
  }

  // Minimum match threshold
  const tokenCount = queryTokens.length;
  if (tokenCount === 1) {
    if (matchedTokensCount < 1 && !hasExactPhrase) return null;
  } else {
    const minRequired = Math.ceil(tokenCount * 0.5);
    if (matchedTokensCount < minRequired && !hasExactPhrase) return null;
    if (matchedTokensCount === tokenCount) {
      totalScore += 500;
    }
  }

  if (totalScore <= 0) return null;

  return {
    score: totalScore,
    matchedTokensCount,
    totalTokensCount: tokenCount,
    hasExactPhrase,
    hasFuzzyMatch,
  };
}

export interface SearchResultItem {
  article: Article;
  score: number;
  hasFuzzyMatch: boolean;
}

/**
 * Searches and ranks articles with typo tolerance and stemming
 */
export function searchArticlesWithFuzzy(
  articles: Article[],
  query: string,
  lang: SiteLanguage
): SearchResultItem[] {
  const clean = query.trim();
  if (!clean) return [];

  const results: SearchResultItem[] = [];

  for (const article of articles) {
    const match = scoreArticle(article, clean, lang);
    if (match) {
      results.push({
        article,
        score: match.score,
        hasFuzzyMatch: match.hasFuzzyMatch,
      });
    }
  }

  // Sort descending by score, tie breaker: created date
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const dateA = new Date(a.article.createdAt || a.article.date || 0).getTime();
    const dateB = new Date(b.article.createdAt || b.article.date || 0).getTime();
    return dateB - dateA;
  });

  return results;
}

export interface TextChunk {
  text: string;
  isMatch: boolean;
}

/**
 * Breaks a string into chunks, marking which words matched the search query (including typos and stems)
 */
export function getHighlightedChunks(text: string, query: string): TextChunk[] {
  if (!text) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [{ text, isMatch: false }];

  const wordRegex = /([\p{L}\p{N}]+)|([^\p{L}\p{N}]+)/gu;
  const rawChunks: TextChunk[] = [];
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[1];
    const nonWord = match[2];

    if (nonWord) {
      rawChunks.push({ text: nonWord, isMatch: false });
    } else if (word) {
      const isMatched = queryTokens.some((qToken) => {
        const res = matchToken(qToken, word);
        return res.isMatch;
      });
      rawChunks.push({ text: word, isMatch: isMatched });
    }
  }

  // Merge consecutive chunks with same isMatch flag for clean rendering
  const merged: TextChunk[] = [];
  for (const c of rawChunks) {
    if (merged.length > 0 && merged[merged.length - 1].isMatch === c.isMatch) {
      merged[merged.length - 1].text += c.text;
    } else {
      merged.push({ ...c });
    }
  }

  return merged;
}
