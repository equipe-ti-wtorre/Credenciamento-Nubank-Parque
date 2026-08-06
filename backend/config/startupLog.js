function startup(msg) {
  console.log(msg);
}

function startupOk(msg) {
  console.log(`✅ ${msg}`);
}

function startupStep(msg) {
  console.log(`🔄 ${msg}`);
}

function startupDone(msg) {
  console.log(`🏁 ${msg}`);
}

function startupLaunch(msg) {
  console.log(`🚀 ${msg}`);
}

function startupWarn(msg) {
  console.log(`⚠️  ${msg}`);
}

function startupFail(msg) {
  console.error(`❌ ${msg}`);
}

function startupCron(msg) {
  console.log(`⏰ ${msg}`);
}

module.exports = {
  startup,
  startupOk,
  startupStep,
  startupDone,
  startupLaunch,
  startupWarn,
  startupFail,
  startupCron,
};
