import type {HarnessGuardMap} from '../../guard/types.js';

export const cmdcGuardMap: HarnessGuardMap = {
  toolAliases: {
    write: 'write_file',
    edit: 'edit_file',
    read: 'read_file',
    find: 'glob',
  },
  shellTools: ['shell_command', 'powershell', 'bash', 'terminal'],
  shellKind: process.platform === 'win32' ? 'powershell' : 'posix',
};
