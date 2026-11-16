import type { HarnessGuardMap } from "../../guard/types.js";

export const openCodeGuardMap: HarnessGuardMap = {
  toolAliases: {
    write: "write_file",
    edit: "edit_file",
    read: "read_file",
    find: "glob",
  },
  shellTools: ["bash", "powershell"],
  shellKind: process.platform === "win32" ? "powershell" : "posix",
};
