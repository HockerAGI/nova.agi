export function stableStringify(obj: any): string {
  const seen = new WeakSet();
  const sorter = (v: any): any => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.map(sorter);
    const out: any = {};
    for (const k of Object.keys(v).sort()) out[k] = sorter(v[k]);
    return out;
  };
  return JSON.stringify(sorter(obj));
}