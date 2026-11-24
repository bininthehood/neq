export function diffServingSet(selected: Set<string>, online: Set<string>): {
  retained: number;
  toPublish: string[];
  toRemove: string[];
} {
  const toPublish = [...selected].filter((key) => !online.has(key));
  const toRemove = [...online].filter((key) => !selected.has(key));
  return { retained: selected.size - toPublish.length, toPublish, toRemove };
}

export function chooseServingKeys(
  required: Iterable<string>,
  ranked: Iterable<string>,
  maxRows: number,
): Set<string> {
  const selected = new Set(required);
  if (selected.size > maxRows) throw new Error("required works exceed online mirror row limit");
  for (const key of ranked) {
    if (selected.size >= maxRows) break;
    selected.add(key);
  }
  return selected;
}
