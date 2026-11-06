import type { RiskAssessment } from '../../../shared/types';

type TierLabelProps = Pick<RiskAssessment, 'score' | 'tier' | 'confidence'> & { showConfidence?: boolean };

export const TierLabel = ({ score, tier, confidence, showConfidence = false }: TierLabelProps) => (
  <span className="tier">
    <span aria-hidden="true" className={`tier-swatch tier-${tier}`} />
    <span className="mono">{score}</span>
    <span>{tier}</span>
    {showConfidence ? <span className="muted">· {confidence} confidence</span> : null}
  </span>
);
