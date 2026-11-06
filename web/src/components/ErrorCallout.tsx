type ErrorCalloutProps = { message: string | null };

export const ErrorCallout = ({ message }: ErrorCalloutProps) =>
  message ? (
    <p className="callout callout-error" role="alert">
      {message}
    </p>
  ) : null;
