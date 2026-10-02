const { logAppError } = require("../modules/error-logs/error-logs.service");
const { captureError, safeJob } = require("../modules/error-logs/error-logs.helpers");

module.exports = { logAppError, captureError, safeJob };
