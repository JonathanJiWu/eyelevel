/**
 * expo-router keeps keys removed via router.setParams({ key: undefined }) in
 * the route params, and useLocalSearchParams then decodes them to the string
 * "undefined". Normalize params before reading them.
 */
export function cleanSearchParams(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string" || value === "" || value === "undefined" || value === "null") continue;
    out[key] = value;
  }
  return out;
}
