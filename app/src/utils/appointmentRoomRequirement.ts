type RoomLike = {
  active: boolean
}

export function getAppointmentRoomRequirement(rooms: RoomLike[]) {
  const hasRegisteredRooms = rooms.length > 0
  const hasSelectableRooms = rooms.some(room => room.active)

  return {
    hasRegisteredRooms,
    hasSelectableRooms,
    requiresRoomSelection: hasRegisteredRooms,
  }
}