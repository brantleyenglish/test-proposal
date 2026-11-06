const redactionRules: { label: string; pattern: RegExp }[] = [
  { label: 'EMAIL', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { label: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'CARD', pattern: /\b(?:\d[ -]?){13,16}\b/g },
  { label: 'MRN', pattern: /\bMRN[:#\s-]*\d{5,10}\b/gi },
  { label: 'PHONE', pattern: /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g },
];

export type RedactionResult = { text: string; redactionCount: number };

export const redactSensitiveText = (text: string): RedactionResult =>
  redactionRules.reduce<RedactionResult>(
    (result, { label, pattern }) => {
      const matches = result.text.match(pattern) ?? [];
      return {
        text: result.text.replace(pattern, `[REDACTED-${label}]`),
        redactionCount: result.redactionCount + matches.length,
      };
    },
    { text, redactionCount: 0 },
  );

export const redactAll = (texts: string[]): RedactionResult[] => texts.map(redactSensitiveText);
