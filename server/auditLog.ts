import { createHash } from 'node:crypto';

import type { AuditEntry, AuditVerification } from '../shared/types';

export const genesisHash = '0'.repeat(64);

export type AuditEntryInput = Omit<AuditEntry, 'sequence' | 'at' | 'previousHash' | 'hash'> & {
  at?: string;
};

type HashableEntry = Omit<AuditEntry, 'hash'>;

const hashEntry = (entry: HashableEntry) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        entry.sequence,
        entry.at,
        entry.actorType,
        entry.actorId,
        entry.actorName,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.relatedIds,
        entry.details,
        entry.previousHash,
      ]),
    )
    .digest('hex');

type AppendAuditEntryParams = { log: AuditEntry[]; input: AuditEntryInput };

export const appendAuditEntry = ({ log, input }: AppendAuditEntryParams): AuditEntry => {
  const previousEntry = log.at(-1);
  const unhashedEntry: HashableEntry = {
    ...input,
    sequence: (previousEntry?.sequence ?? 0) + 1,
    at: input.at ?? new Date().toISOString(),
    previousHash: previousEntry?.hash ?? genesisHash,
  };
  const entry = { ...unhashedEntry, hash: hashEntry(unhashedEntry) };
  log.push(entry);
  return entry;
};

export const verifyAuditChain = (log: AuditEntry[]): AuditVerification => {
  const brokenEntry = log.find((entry, index) => {
    const expectedPreviousHash = index === 0 ? genesisHash : log[index - 1]?.hash;
    const { hash, ...unhashedEntry } = entry;
    return entry.previousHash !== expectedPreviousHash || hashEntry(unhashedEntry) !== hash;
  });
  return {
    isValid: brokenEntry === undefined,
    entryCount: log.length,
    brokenAtSequence: brokenEntry?.sequence ?? null,
    headHash: log.at(-1)?.hash ?? null,
  };
};

export const getEntityHistory = ({ log, entityIds }: { log: AuditEntry[]; entityIds: string[] }) =>
  log.filter(
    (entry) =>
      entityIds.includes(entry.entityId) ||
      entry.relatedIds.some((relatedId) => entityIds.includes(relatedId)),
  );
