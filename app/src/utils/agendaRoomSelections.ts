export function fillMissingRoomSelections(
  current: Record<string, string>,
  appointments: Array<{ id: string }>,
  defaultRoomId: string,
): Record<string, string> {
  let next = current

  for (const appointment of appointments) {
    if (next[appointment.id]) continue
    if (next === current) next = { ...current }
    next[appointment.id] = defaultRoomId
  }

  return next
}
