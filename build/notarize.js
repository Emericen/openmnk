const { notarize } = require("electron-notarize")
const path = require("path")

async function afterSign(context) {
  if (
    context.electronPlatformName !== "darwin" ||
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false"
  ) {
    console.log("Skipping notarization")
    return
  }
  console.log("Notarizing...")

  const appBundleId = context.packager.appInfo.info._configuration.appId
  const appName = context.packager.appInfo.productFilename
  const appPath = path.normalize(path.join(context.appOutDir, `${appName}.app`))
  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  if (!appleId || !appleIdPassword) {
    console.warn("Not notarizing: Missing APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD")
    return
  }
  return notarize({
    tool: "notarytool",
    appBundleId,
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  })
}

exports.default = afterSign
exports.afterSign = afterSign
