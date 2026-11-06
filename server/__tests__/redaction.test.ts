import { redactSensitiveText } from '../redaction';

describe('redactSensitiveText', () => {
  it('redacts emails, SSNs, card numbers and medical record numbers', () => {
    const { text, redactionCount } = redactSensitiveText(
      'jane.doe@contoso.example uploaded MRN 448192031 with SSN 123-45-6789 and card 4111 1111 1111 1111',
    );
    expect(text).toBe(
      '[REDACTED-EMAIL] uploaded [REDACTED-MRN] with SSN [REDACTED-SSN] and card [REDACTED-CARD]',
    );
    expect(redactionCount).toBe(4);
  });

  it('leaves text without sensitive data unchanged', () => {
    expect(redactSensitiveText('4.2 MB uploaded to quicksummary.example')).toEqual({
      text: '4.2 MB uploaded to quicksummary.example',
      redactionCount: 0,
    });
  });
});
