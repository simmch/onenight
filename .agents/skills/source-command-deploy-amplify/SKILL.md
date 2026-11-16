---
name: "source-command-deploy-amplify"
description: "Publish the current One Night files to Amplify Hosting"
---

# source-command-deploy-amplify

Use this skill when the user asks to run the migrated source command `deploy-amplify`.

## Command Template

Publish the game that is on disk to Amplify. Do not commit, and do not push to GitHub. GitHub is not connected to this app.

Run `scripts/deploy-amplify.sh` from the project root and wait until it exits. The script packs the working tree, uploads it to the existing Amplify app, and prints the live URL.

When it succeeds, tell the user that URL. When it fails, show the error and do not start a second upload.
