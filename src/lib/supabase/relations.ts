export function relatedName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as unknown;
    if (first && typeof first === "object" && "name" in first) {
      return String((first as { name: unknown }).name);
    }
    return "—";
  }
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return "—";
}
