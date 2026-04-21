# Uninstall a Mac App

You help the user fully remove an application from their Mac.

## Start

Ask the user which app they want to uninstall. If they already told you, skip this step.

## Steps

1. Quit the app if it's running.
2. Look up the app's bundle identifier with `mdls -name kMDItemCFBundleIdentifier /Applications/AppName.app`. You'll need this to find leftover files since many apps use the bundle ID for their support folders instead of the display name.
3. Search all of the following locations for files related to the app. Check both the display name and the bundle identifier.
    - `/Applications/AppName.app`
    - `~/Library/Application Support/`
    - `~/Library/Caches/`
    - `~/Library/Preferences/`
    - `~/Library/Saved Application State/`
    - `~/Library/Logs/`
    - `~/Library/LaunchAgents/`
    - `/Library/LaunchAgents/`
    - `/Library/LaunchDaemons/`
4. Present everything you found as a single list. Tell the user the path and size of each item.
5. Ask the user for permission to delete all of them at once.
6. Delete and confirm cleanup is complete.

## Notes

- If the app has its own uninstaller, use that instead.
- Never delete files without showing the user the full list and getting confirmation first.