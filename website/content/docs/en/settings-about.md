# Settings: About

The “About” tab of the settings shows Escouade’s version, looks for updates, says whether they install by themselves, and shows where your local data lives.

## Open the tab

Open the settings with `Ctrl+,` (`⌘,` on macOS), then choose “About” (“Version and local data”). These are the app’s settings, shared by all projects; they apply on “Save”. The version is also written at the bottom of the column of tabs, after the word “Escouade”, whichever tab is open.

## Escouade

The tab has a single group, “Escouade”, with three lines.

| Line | What it shows or does | Default |
|---|---|---|
| “Escouade” followed by the version | The installed version. Below it, “Claude Code detected” or “Claude Code not found”, depending on whether Escouade finds `claude`. On the right, the “Check for updates” button. | — |
| “Install updates automatically” | “Escouade restarts itself when no agent is working and everything is saved.” | On |
| “Local data” | The folder where Escouade keeps its data: `~/.escouade/`. | — |

If Claude Code isn’t found, give its path in the [“Claude Code”](settings-claude-code) tab.

## Check for updates

Escouade looks on its own: once a few seconds after it starts, then five minutes after each check ends. The “Check for updates” button (it reads “Checking…” during the call) starts a check right away. With no newer version, a message says “No update available.”; if the check fails, an error message says so.

A version found is downloaded right away and its signature is checked, then it waits. When it’s ready, the status bar shows a button, for example “Update 1.8.0 ready · Restart”. It opens a window, for example “Escouade 1.8.0 is ready”, which shows the version’s notes. “Restart now” installs the update. It’s grayed out while a file in the editor isn’t saved (the window tells you), and the window warns you when agents are working, since the restart interrupts their turn. “Later” closes the window without installing anything.

Checking and downloading go through the proxy of the [“Network”](settings-network) tab. The whole flow is in [updates](updates).

## Install updates automatically

On by default. A downloaded update then restarts Escouade by itself, as soon as the app is at rest. Off, the update stays ready: you start it with “Restart” in the status bar, or it installs when you close the app (which then stays closed).

Escouade is at rest when none of this is true:

- an agent is in the middle of a turn, or is waiting for your answer or a permission;
- a worktree is being set up;
- a ticket is being approved, or other work is under way (starting a ticket, cleaning up…);
- a launch command or a step of a test launch is running, or a test launch is being prepared;
- a built-in terminal has received or produced text in the last 5 minutes;
- a file in the editor isn’t saved;
- a window is open over the app;
- you’ve used the keyboard or the mouse in the window in the last 5 minutes (a hidden or minimized window doesn’t count).

Once it’s at rest, Escouade warns you 30 seconds ahead: a system notification (not on Linux), even if system notifications are off in the [“Notifications”](settings-notifications) tab, says “Escouade is restarting to update” with a “Later” button, and the status bar counts down (“Restarting in 20 s”). “Later” postpones the restart by 30 minutes. It is in the status bar, next to the countdown, and in the notification on Windows only (the macOS notification has no button). If, during those 30 seconds, you pick the app back up or an agent starts working again, the restart is canceled.

If a version couldn’t install, Escouade no longer restarts by itself for it: you can try again by hand.

> [!NOTE]
> On macOS, the automatic restart only happens if Escouade can replace its app without an administrator password. Otherwise, restart it yourself when the update is ready.

## Local data

The “Local data” line shows `~/.escouade/`, in your home folder (`C:\Users\<you>\.escouade` on Windows). The tab only shows where the folder is: it has no button to open it, so open it with your file manager. What it holds is described in [local data](data).
