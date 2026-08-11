/** Match MySQL missing-table errors, including errors wrapped by Drizzle. */
export function isMissingTableError(error: unknown): boolean {
  let current: any = error;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (current.code === "ER_NO_SUCH_TABLE" || current.errno === 1146) return true;
    current = current.cause;
  }
  return false;
}
