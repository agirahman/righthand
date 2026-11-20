'use strict';

const cmdcLaunch = require('../harness/cmdc/launch');

module.exports = {
  CMDC_BIN: cmdcLaunch.CMDC_BIN,
  buildLaunchArgs: cmdcLaunch.buildLaunchArgs,
  formatCommand: cmdcLaunch.formatCommand,
};
