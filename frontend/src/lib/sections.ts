export type SectionId =
  | 'cameras'
  | 'health'
  | 'discovery'
  | 'settings'
  | 'camera-settings'
  | 'events'
  | 'recordings'
  | 'faces'
  | 'users'

export const sectionLabels: Record<SectionId, string> = {
  cameras: 'Cameras',
  health: 'Health',
  discovery: 'Discovery',
  settings: 'Settings',
  'camera-settings': 'Camera Settings',
  events: 'Events',
  recordings: 'Recordings',
  faces: 'Faces',
  users: 'Users',
}
