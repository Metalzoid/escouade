# Updates

Escouade updates itself from GitHub releases: it downloads in the background, then installs at the restart you choose or, if you allow it, by itself when it is at rest. This page explains how, system by system, and where to read what’s new.

## How it works

- Escouade looks for a new version shortly after it starts, then five minutes after each check ends. It reads the `latest.json` file of the latest release published on [GitHub](https://github.com/guillaume-gagnaire/escouade/releases).
- When a newer version exists, it downloads it right away, without asking, and checks its signature. During the download, the status bar shows “Update 1.8.0…” (with the version number).
- Once downloaded, the update waits: the status bar shows “Update 1.8.0 ready · Restart”. It installs when you restart the app, when the app restarts by itself, or when you quit it.
- Installation happens without an installer window. The proxy and certificate verification set in Settings › Network apply to the checks and downloads too.

## Installing an update

### Restart yourself

Clicking “Update 1.8.0 ready · Restart” opens the “Escouade 1.8.0 is ready” window, which shows the release notes. It has two buttons: “Later” and “Restart now”.

The window warns you about what a restart cuts off:

- Editor files aren’t saved: “Save your files first”. The “Restart now” button stays disabled as long as some remain.
- Agents are working or waiting for your answer: their current turn is interrupted. A ticket agent picks up again by itself; the others wait for your next message.

Escouade stops cleanly before installing: the agents’ processes and the terminals stop, and each agent’s session and the app’s state are saved. After the restart, the window comes back as it was (in front, behind another window, minimized, or closed to the notification area), and a message in the window says “Escouade 1.8.0 is installed.”, with a “See what’s new” button.

### Restart automatically

The “Install updates automatically” setting (Settings › About, on by default) lets Escouade restart by itself: “Escouade restarts itself when no agent is working and everything is saved.”

The app is at rest when none of this is true:

- An agent is working or waiting for your answer (a question or a permission).
- A worktree is being set up.
- A ticket is being approved (merge, pull request, push), or other work is under way outside an agent’s turn, for example a ticket starting or a merge you asked for by hand.
- A launch command or a step of a test launch is running, or a test launch is being prepared.
- A built-in terminal has received or displayed something in the last five minutes. A terminal that has been silent longer doesn’t count.
- The editor holds unsaved files.
- A dialog (settings, commit…) is open.
- You have touched the keyboard or the mouse in the window in the last five minutes. This only counts if the window is on screen: minimized or closed to the notification area, it no longer holds the restart back.

When the app is at rest, Escouade warns you thirty seconds before restarting: the status bar shows “Restarting in 30 s” with a “Later” button, and a system notification says “Escouade is restarting to update”, whatever the “System notifications” setting says (on Windows, with the same “Later” button; on Linux, only the status bar warns you). If the app stops being at rest during that countdown (an agent gets back to work, you touch the keyboard), the restart is canceled and waits for the next rest. “Later” pushes it back by thirty minutes.

### Quitting the app

Closing the window doesn’t quit Escouade: it stays in the notification area. If you quit it (“Quit” in the menu of its icon, or `⌘Q` on macOS) while an update is ready, the update installs and the app stays closed.

### If the installation fails

The app stays on the old version and says so: “The update to 1.8.0 couldn’t be installed.” with a “Retry” button, which reopens the update window. It no longer restarts by itself for that version; it tries again on request, or when you quit the app.

## Checking by hand

Settings › About shows the installed version (“Escouade 1.7.5”, for example) and a “Check for updates” button. The answer is “No update available.”, or the update appears in the status bar. A failure is reported as it is: “Couldn’t check for updates” or “Couldn’t download the update”, followed by what the server answered. Behind a proxy or a corporate certificate, see [troubleshooting](troubleshooting).

## By system

### Windows

The installer runs without a window, and Escouade restarts on the new version.

### macOS

The app is signed with an Apple Developer ID certificate and notarized by Apple (since 1.5.4): macOS opens it without asking for permission. The update replaces the app in place.

The automatic restart, and the installation when the app quits, require that your user can modify Escouade.app and the folder that holds it. Otherwise the update waits for you to click “Restart now”, and macOS may ask for an administrator password.

### Linux

The built-in update replaces the `AppImage` you launched. The `.deb` (Debian, Ubuntu) is first installed with `sudo apt install ./Escouade_*_amd64.deb`; after that, the built-in update downloads the release’s new `.deb` and installs it with `dpkg`: the system then asks for your administrator password (through `pkexec`, otherwise through `sudo`).

## From Claude Code Manager to Escouade

Escouade used to be called “Claude Code Manager”. The update that renamed it replaces the old installation and keeps your settings, projects, and conversations. On Windows, the installer first removes the old installation, keeping your data, then creates Escouade’s shortcuts. The data folder changes name: see [local data](data).

## Reading what changed

- **In the app.** The window of a ready update shows its notes. After the installation, “See what’s new” opens “What’s new in Escouade 1.8.0”.
- **On GitHub.** The [changelog](https://github.com/guillaume-gagnaire/escouade/blob/main/CHANGELOG.md) lists, version by version, what changes. The notes of each release reuse that version’s section.
