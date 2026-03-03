/**
 * Commentary Scraper — Fetches exact Reformed commentary excerpts from Bible Hub.
 *
 * Supported commentators (all public domain, verse-indexed):
 *   - John Calvin (Calvin's Commentaries)
 *   - John Gill (Gill's Exposition of the Entire Bible)
 *   - Matthew Henry (Complete Commentary on the Whole Bible)
 *
 * URL pattern: https://biblehub.com/commentaries/{author}/{book}/{chapter}.htm
 * Each page contains per-verse commentary blocks in structured HTML.
 */

// ── Book name → Bible Hub slug mapping ──────────────────────────────

const BOOK_SLUGS: Record<string, string> = {
  Genesis: "genesis", Exodus: "exodus", Leviticus: "leviticus",
  Numbers: "numbers", Deuteronomy: "deuteronomy", Joshua: "joshua",
  Judges: "judges", Ruth: "ruth", "1 Samuel": "1_samuel",
  "2 Samuel": "2_samuel", "1 Kings": "1_kings", "2 Kings": "2_kings",
  "1 Chronicles": "1_chronicles", "2 Chronicles": "2_chronicles",
  Ezra: "ezra", Nehemiah: "nehemiah", Esther: "esther",
  Job: "job", Psalm: "psalms", Psalms: "psalms",
  Proverbs: "proverbs", Ecclesiastes: "ecclesiastes",
  "Song of Solomon": "songs", Isaiah: "isaiah", Jeremiah: "jeremiah",
  Lamentations: "lamentations", Ezekiel: "ezekiel", Daniel: "daniel",
  Hosea: "hosea", Joel: "joel", Amos: "amos", Obadiah: "obadiah",
  Jonah: "jonah", Micah: "micah", Nahum: "nahum",
  Habakkuk: "habakkuk", Zephaniah: "zephaniah", Haggai: "haggai",
  Zechariah: "zechariah", Malachi: "malachi",
  Matthew: "matthew", Mark: "mark", Luke: "luke", John: "john",
  Acts: "acts", Romans: "romans", "1 Corinthians": "1_corinthians",
  "2 Corinthians": "2_corinthians", Galatians: "galatians",
  Ephesians: "ephesians", Philippians: "philippians",
  Colossians: "colossians", "1 Thessalonians": "1_thessalonians",
  "2 Thessalonians": "2_thessalonians", "1 Timothy": "1_timothy",
  "2 Timothy": "2_timothy", Titus: "titus", Philemon: "philemon",
  Hebrews: "hebrews", James: "james", "1 Peter": "1_peter",
  "2 Peter": "2_peter", "1 John": "1_john", "2 John": "2_john",
  "3 John": "3_john", Jude: "jude", Revelation: "revelation",
};

const COMMENTATORS = [
  { key: "calvin", fullName: "John Calvin", title: "Calvin's Commentaries" },
  { key: "gill", fullName: "John Gill", title: "Gill's Exposition of the Entire Bible" },
  { key: "mhcw", fullName: "Matthew Henry", title: "Matthew Henry's Complete Commentary" },
] as const;

export type Commentator = (typeof COMMENTATORS)[number];

export interface CommentaryResult {
  author: string;
  commentary: string;
  sourceUrl: string;
  sourceTitle: string;
}

// ── Parse a verse reference ─────────────────────────────────────────

export function parseVerseRef(ref: string): {
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number | null;
} {
  const match = ref.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error(`Invalid verse reference: ${ref}`);
  return {
    book: match[1],
    chapter: parseInt(match[2], 10),
    startVerse: parseInt(match[3], 10),
    endVerse: match[4] ? parseInt(match[4], 10) : null,
  };
}

// ── Extract commentary for a specific verse from HTML ───────────────

function extractVerseCommentary(
  html: string,
  startVerse: number,
  endVerse: number | null,
): string | null {
  // Bible Hub structures commentaries with verse numbers as anchors or bold text.
  // Each verse section typically starts with the verse number in bold.
  // We look for patterns like "Verse 5." or "<b>5</b>" or "5. " at paragraph starts.
  const targetVerses = new Set<number>();
  const end = endVerse ?? startVerse;
  for (let v = startVerse; v <= end; v++) targetVerses.add(v);

  // Strip HTML tags for text extraction but preserve paragraph breaks
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Strategy 1: Look for "Verse N." or "N. " patterns that Bible Hub uses
  const lines = text.split("\n");
  const collected: string[] = [];
  let capturing = false;
  let capturedVerseCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (capturing && collected.length > 0) collected.push("");
      continue;
    }

    // Check if this line starts a new verse section
    const verseMatch = trimmed.match(/^(?:Verse\s+)?(\d+)\.\s/);
    if (verseMatch) {
      const vNum = parseInt(verseMatch[1], 10);
      if (targetVerses.has(vNum)) {
        capturing = true;
        capturedVerseCount++;
        collected.push(trimmed);
        continue;
      } else if (capturing && vNum > end) {
        break;
      }
    }

    if (capturing) {
      collected.push(trimmed);
    }
  }

  if (collected.length > 0) {
    return cleanCommentary(collected.join(" "));
  }

  // Strategy 2: If no verse markers found, grab a meaningful section of the page
  // This handles cases where the commentary doesn't use verse numbering
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 40);
  if (paragraphs.length > 0) {
    // Take the first substantial paragraph(s) up to ~800 chars
    let result = "";
    for (const p of paragraphs) {
      if (result.length + p.length > 800 && result.length > 100) break;
      result += (result ? " " : "") + p.trim();
    }
    return cleanCommentary(result);
  }

  return null;
}

// ── Clean and trim commentary to 3-10 sentences ────────────────────

function cleanCommentary(raw: string): string {
  let text = raw
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];

  // Take 3-10 sentences, targeting ~300-600 chars
  const selected: string[] = [];
  let charCount = 0;
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    selected.push(trimmed);
    charCount += trimmed.length;
    if (selected.length >= 10) break;
    if (selected.length >= 3 && charCount >= 500) break;
  }

  return selected.join(" ").trim();
}

// ── Fetch commentary from Bible Hub ─────────────────────────────────

export async function fetchCommentary(
  verseRef: string,
  commentatorIndex?: number,
): Promise<CommentaryResult | null> {
  const parsed = parseVerseRef(verseRef);
  const bookSlug = BOOK_SLUGS[parsed.book];
  if (!bookSlug) {
    console.error(`[Commentary] No slug for book: ${parsed.book}`);
    return null;
  }

  // Try each commentator in order, starting from the specified index
  const startIdx = commentatorIndex ?? 0;
  const order = [
    ...COMMENTATORS.slice(startIdx),
    ...COMMENTATORS.slice(0, startIdx),
  ];

  for (const commentator of order) {
    const url = `https://biblehub.com/commentaries/${commentator.key}/${bookSlug}/${parsed.chapter}.htm`;
    try {
      console.log(`[Commentary] Fetching ${commentator.fullName} on ${verseRef}: ${url}`);
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SentinelERP/1.0)",
          Accept: "text/html",
        },
      });

      if (!res.ok) {
        console.warn(`[Commentary] ${commentator.key} returned ${res.status} for ${verseRef}`);
        continue;
      }

      const html = await res.text();
      const commentary = extractVerseCommentary(
        html,
        parsed.startVerse,
        parsed.endVerse,
      );

      if (commentary && commentary.length >= 50) {
        return {
          author: commentator.fullName,
          commentary,
          sourceUrl: url,
          sourceTitle: commentator.title,
        };
      }

      console.warn(`[Commentary] ${commentator.key} — no usable excerpt for ${verseRef}`);
    } catch (err) {
      console.error(`[Commentary] ${commentator.key} fetch error:`, err);
    }
  }

  return null;
}

export function getCommentatorForDay(dayOfYear: number): number {
  return dayOfYear % COMMENTATORS.length;
}
