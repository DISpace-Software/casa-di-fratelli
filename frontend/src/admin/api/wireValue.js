// Legacy endpoints return both camelCase and PascalCase. Preserve false and zero values.
export function getValue(item, key) {
  return item?.[key] ?? item?.[key[0].toUpperCase() + key.slice(1)];
}

