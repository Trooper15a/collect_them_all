/** A catalogue ID may be a provider's numeric ID; ownership uses the set code. */
export function setKey(set: { tcg: string; code: string | null; language: string }) {
  return `${set.tcg}:${set.code ?? ""}:${set.language}`.toLowerCase();
}

export function cardNumberKey(number: string | null, fallback: string) {
  if (!number?.trim()) return fallback;
  const parts = number.trim().toLowerCase().split("/");
  // Numeric denominators describe set size. Preserve prefixes such as SET/001EN.
  const value = parts.length === 2 && /^\d+$/.test(parts[1]) ? parts[0] : parts.join("/");
  return value.replace(/^([a-z]*?)0+(?=\d)/, "$1");
}
