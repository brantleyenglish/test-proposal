import type { AuditEntry } from '../../shared/types';
import { appendAuditEntry, genesisHash, getEntityHistory, verifyAuditChain } from '../auditLog';

const buildLog = () => {
  const log: AuditEntry[] = [];
  ['app.discovered', 'review.routed', 'review.decision-recorded'].forEach((action, index) => {
    appendAuditEntry({
      log,
      input: {
        actorType: 'system',
        actorId: 'cockpit',
        actorName: 'Cockpit engine',
        action,
        entityType: index === 0 ? 'app' : 'review',
        entityId: index === 0 ? 'app-1' : 'rev-1',
        relatedIds: index === 0 ? [] : ['app-1'],
        details: { step: index },
      },
    });
  });
  return log;
};

describe('audit chain', () => {
  it('links each entry to the previous hash, starting from genesis', () => {
    const log = buildLog();
    expect(log[0]?.previousHash).toBe(genesisHash);
    expect(log[1]?.previousHash).toBe(log[0]?.hash);
    expect(log.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    expect(verifyAuditChain(log)).toMatchObject({ isValid: true, entryCount: 3, brokenAtSequence: null });
  });

  it('detects an edited entry', () => {
    const log = buildLog();
    const tamperedLog = log.map((entry) =>
      entry.sequence === 2 ? { ...entry, details: { step: 99 } } : entry,
    );
    expect(verifyAuditChain(tamperedLog)).toMatchObject({ isValid: false, brokenAtSequence: 2 });
  });

  it('detects a deleted entry', () => {
    const log = buildLog();
    expect(verifyAuditChain([log[0], log[2]].filter((entry): entry is AuditEntry => Boolean(entry)))).toMatchObject({
      isValid: false,
      brokenAtSequence: 3,
    });
  });

  it('returns history for an entity including entries that reference it', () => {
    expect(getEntityHistory({ log: buildLog(), entityIds: ['app-1'] })).toHaveLength(3);
  });
});
