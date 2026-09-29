export function isPersistedWorkspace(id) {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

export function canStartAutomaticAlignment(props, hosting) {
  if (hosting && props._gyde_readonly) return false;
  if (hosting && !props.slivkaService?.service("mafft-7.475")) return false;
  const stale = Boolean(
    props.msaColumns?.some((mc) => mc && !props.columnarData[mc.column]),
  );
  return (
    props.seqColumns.length > 0 &&
    (!props.msaColumns || stale) &&
    !props.mafftPending &&
    !props.specialAlign &&
    props.alignmentKey !== "seqs" &&
    (!props.error || stale)
  );
}

export function dataColumnInventory(columnarData) {
  return Object.keys(columnarData || {}).filter(
    (name) => columnarData[name] !== undefined,
  );
}
