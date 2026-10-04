/** Parse explicit check selections without coupling them to repository state. */
export function readCheckOptions(args) {
  const only = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg !== '--only' && !arg.startsWith('--only=')) continue;
    const value = arg === '--only' ? args[++index] : arg.slice('--only='.length);
    if (!value || value.startsWith('--')) throw new Error('--only needs a suite name or comma-separated names.');
    const names = value.split(',').map(name => name.trim()).filter(Boolean);
    if (!names.length) throw new Error('--only needs a suite name or comma-separated names.');
    only.push(...names);
  }
  const all = args.includes('--all');
  if (all && only.length) throw new Error('Choose --all or --only; combining them is ambiguous.');
  return {all, only:[...new Set(only)], list:args.includes('--list')};
}

export function selectChecks(suites, options, changed) {
  const names = new Set(suites.map(suite => suite.name));
  const unknown = options.only.filter(name => !names.has(name));
  if (unknown.length) throw new Error(`Unknown suite '${unknown.join(', ')}'. Use: ${[...names].join(', ')}.`);
  return suites.filter(suite => options.all || (options.only.length
    ? options.only.includes(suite.name)
    : changed.some(file => (suite.reaches ?? []).some(rule => rule.test(file)))));
}

/** Porcelain -z preserves spaces and Unicode; rename records list destination first. */
export function changedPaths(output) {
  const records = output.split('\0'), paths = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) continue;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0,2))) index++;
  }
  return paths;
}
