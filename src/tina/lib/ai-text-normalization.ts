const COMMON_MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u2018", "'"],
  ["\u2019", "'"],
  ["\u201c", '"'],
  ["\u201d", '"'],
  ["\u2013", "-"],
  ["\u2014", "-"],
  ["\u00e2\u20ac\u2122", "'"],
  ["\u00e2\u20ac\u02dc", "'"],
  ["\u00e2\u20ac\u0153", '"'],
  ["\u00e2\u20ac\u009d", '"'],
  ["\u00e2\u20ac\u201c", "-"],
  ["\u00e2\u20ac\u201d", "-"],
  ["\u00c2\u00a7", "\u00a7"],
  ["\u670d\u52a1", " service "],
  ["\u00e6\u0153\u008d\u00e5\u0160\u00a1", " service "],
  ["\u00c2", ""],
];

function stripSuspiciousInlineNoise(value: string): string {
  return value.replace(
    /([A-Za-z]{2,}\s+)([^\x00-\x7F]{2,8})(\s+[A-Za-z]{2,})/g,
    (match, before: string, noise: string, after: string) => {
      if (!/[^\u0000-\u007F]/.test(noise)) return match;
      return `${before.trimEnd()} ${after.trimStart()}`;
    }
  );
}

export function sanitizeTinaAiText(value: string): string {
  let sanitized = value;

  COMMON_MOJIBAKE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    sanitized = sanitized.split(pattern).join(replacement);
  });

  sanitized = stripSuspiciousInlineNoise(sanitized)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return sanitized;
}

export function sanitizeTinaAiTextList(values: string[]): string[] {
  const seen = new Set<string>();
  const sanitizedValues: string[] = [];

  values.forEach((value) => {
    const sanitized = sanitizeTinaAiText(value);
    if (!sanitized || seen.has(sanitized)) return;
    seen.add(sanitized);
    sanitizedValues.push(sanitized);
  });

  return sanitizedValues;
}
