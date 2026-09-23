import type { LocalMap, LocalMapSnapshot } from "./map";
import { validateSnapshot } from "./map";

export interface MapTransaction {
  readonly baseVersion: number;
  readonly candidate: LocalMapSnapshot;
}

export function beginMapTransaction(map: LocalMap): MapTransaction {
  const snapshot = map.snapshot();
  return { baseVersion: snapshot.version, candidate: snapshot };
}

export function commitMapTransaction(map: LocalMap, transaction: MapTransaction, candidate: LocalMapSnapshot): boolean {
  if (transaction.baseVersion !== map.snapshot().version || !validateSnapshot(candidate)) return false;
  return map.commitSnapshot(transaction.baseVersion, candidate);
}

export function withUpdatedLandmark(
  transaction: MapTransaction,
  id: string,
  update: (landmark: LocalMapSnapshot["landmarks"][number]) => LocalMapSnapshot["landmarks"][number],
): MapTransaction {
  const index = transaction.candidate.landmarks.findIndex((landmark) => landmark.id === id);
  if (index < 0) return transaction;
  const landmarks = [...transaction.candidate.landmarks];
  landmarks[index] = update(landmarks[index]!);
  return { ...transaction, candidate: { ...transaction.candidate, landmarks } };
}
