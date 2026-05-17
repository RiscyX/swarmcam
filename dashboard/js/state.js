const _snapIntervals = {};
const _streamMode    = {};
const _torchState    = {};
const _cameras       = {};
const _healthData    = {};
let _currentLayout   = 'auto';
let _fsCam           = null;
let _fsImg           = null;
let _fsTorchState    = false;

const SEC_LABELS = {
  cameras: 'Cameras',
  health: 'Health',
  discovery: 'Discovery',
  settings: 'Settings',
  'cam-settings': 'Camera Settings',
  events: 'Events',
  recordings: 'Recordings',
  faces: 'Faces',
  users: 'Users',
};
