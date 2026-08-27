# Roadmap

This document tracks the planned release rounds and the OS-focused modules we intend to
ship. Day-to-day execution details live in [PLAN.md](./PLAN.md).

Unless noted otherwise, new packages follow the existing split layout (`jsr/` Deno-only
and `npm/` cross-runtime via FFI).

## `win-winget`

Windows Package Manager integration through the local `Microsoft.Management.Deployment`
COM/WinRT API.

- Search the configured package sources and enumerate installed packages.
- Install, uninstall, upgrade, and download packages.
- Manage package sources and report API availability.
- Use the `winget` CLI only as a fallback where the native API lacks coverage.

## Release Round 1 — `0.0.0-alpha.1`

Goal: validate the publishing pipeline end-to-end before adding new modules.

- Cut an alpha release (`0.0.0-alpha.1`) of all existing packages.
- npm: migrate publishing to OIDC-based trusted publishing (no long-lived tokens) and
  verify deployments work from GitHub Actions.
- JSR: migrate publishing from access tokens to GitHub Actions OIDC
  (`id-token: write` + `deno publish`), which is what jsr.io recommends.

## Release Round 2 — Core OS modules

### `os-release`

- Linux: parse `/etc/os-release` (and `/usr/lib/os-release`).
- Windows/macOS: expose the platform equivalent (registry `ProductName`/version info on
  Windows, `sw_vers`-style data via FFI on macOS).
- Decide between implementing in-repo or importing an existing module.

### `os-keyring` or `os-secrets`

Keytar-like unified secret storage facade over the platform backends:

- Windows: `win-cred`
- macOS: `darwin-keychain`
- Linux: `linux-libsecret`

Name to be finalized (`@neotales/os-keyring` vs `@neotales/os-secrets`).

### `win-task-scheduler`

- FFI-based wrapper around the Windows Task Scheduler (COM/Task Scheduler API).
- Make it easy to create, update, delete, list, and trigger scheduled tasks.

### `os-user`

Go `os/user`-style API:

- POSIX/libc for Unix-like systems (uid/gid, username, home directory, groups).
- Windows APIs for account lookup (SID, name, groups).

### `win-special-folder`

- Registry-backed lookup of Windows special folders (Desktop, Documents, Start Menu,
  etc.).
- Consider a follow-up `os-special-folder` package that maps equivalents across
  platforms.

### `win-env-var`

- Read/modify environment variables for the current user and the machine (system) scope
  via the registry / Windows APIs.

### `os-pending-reboot`

- Detect whether the OS is waiting for a reboot.
- Windows: registry-based detection (Windows Update, CBS, pending file rename, MSI
  reboot required).
- Linux/macOS: best-effort equivalents (e.g. `/var/run/reboot-required`, kernel
  version vs running kernel on Linux; pending updates heuristics elsewhere).

### `win-toast`

- Native toast notifications on Windows via FFI — no PowerShell shelling out.
- Call the WinRT `Windows.UI.Notifications` APIs (`ToastNotificationManager`) by walking
  COM vtables directly (same approach as koffi/Deno FFI for other WinRT surfaces).
- Support title/body, app identifier (AUMID), and basic activation handling.

### `win-acl`

- Windows file system permissions via FFI — no `icacls` shelling out.
- Use the `advapi32.dll` security APIs (`GetNamedSecurityInfoW`,
  `SetNamedSecurityInfoW`, `GetAce`, `AddAccessAllowedAceEx`, `DeleteAce`,
  `LookupAccountSidW`, SDDL conversion) to read, grant, deny, and remove ACEs.

### `os-speech`

- Text-to-speech first; speech recognition later.
- Windows: SAPI 5 (`ISpVoice` via COM vtables in `sapi.dll`); WinRT
  `Windows.Media.SpeechRecognition` for recognition.
- macOS: `AVSpeechSynthesizer` (AVFoundation) through the Objective-C runtime;
  `SFSpeechRecognizer` for recognition.
- Linux: `speech-dispatcher` (`libspeechd`) or `espeak-ng` plain C APIs.

### `os-fonts`

- Install, remove, and list fonts.
- Windows: `AddFontResourceW`/`RemoveFontResourceW` for per-session fonts; permanent
  install via copying into `C:\Windows\Fonts` plus a registry value under
  `HKLM\...\CurrentVersion\Fonts`; listing via `EnumFontFamiliesExW` or the registry.
- macOS: CoreText `CTFontManagerRegisterFontsForURL` /
  `CTFontManagerUnregisterFontsForURL` (per-user or system scope) and
  `CTFontManagerCopyAvailableFontFamilyNames` for listing.
- Linux: copy into `~/.local/share/fonts` or `/usr/share/fonts` then refresh caches;
  enumerate via `libfontconfig`.

## Release Round 3 — Platform utilities

High-value, FFI-friendly utilities with small API surfaces.

### `os-trash`

- Send files/directories to the Recycle Bin/Trash instead of deleting them.
- Windows: `SHFileOperationW` with `FOF_ALLOWUNDO` (or `IFileOperation` via COM).
- macOS: `NSWorkspace` recycle through the Objective-C runtime.
- Linux: Freedesktop trash spec (`~/.local/share/Trash`) or `gio` helpers.

### `os-sleep-prevention`

- Keep-awake assertions so long-running tasks are not interrupted by sleep.
- Windows: `SetThreadExecutionState`.
- macOS: `IOPMAssertionCreateWithName` (IOKit).
- Linux: systemd inhibitor locks (`SD_INHIBIT` D-Bus API).

### `os-volumes`

- List drives/mounts with capacity and free space; eject/unmount support.
- Windows: `GetLogicalDrives`, `GetLogicalDriveStringsW`, `GetDiskFreeSpaceExW`,
  `CM_Get_DevNode_Status` for ejectability.
- macOS: DiskArbitration / `NSWorkspace` mount notifications.
- Linux: `/proc/mounts` + `statvfs`, `udisks2` for eject where available.

### `os-process`

- List processes; send signals (POSIX) / terminate (Windows); query CPU/memory usage.
- POSIX: `/proc` or `libproc`, `kill`.
- Windows: `Toolhelp32` snapshots, `OpenProcess`/`TerminateProcess`.

### `win-clipboard`

- Clipboard read/write via FFI (`user32`/`kernel32` clipboard APIs).
- Possibly a cross-platform `os-clipboard` follow-up (macOS pasteboard, X11/Wayland
  selections).

### `os-power`

- Battery status; shutdown/reboot/suspend initiation per platform.
- Windows: `GetSystemPowerStatus`, `InitiateSystemShutdownExW`, `SetSuspendState`.
- macOS: IOKit power sources (`IOPSCopyPowerSourcesInfo`), `RebootSystem`/sleep.
- Linux: `/sys/class/power_supply`, logind D-Bus calls.

## Release Round 4 — Desktop & display

### `os-display`

- Monitor enumeration, resolution, refresh rate, DPI, primary display detection.
- Windows: `EnumDisplayMonitors`, `EnumDisplaySettingsW`, `GetDpiForMonitor`.
- macOS: `CGDisplay` functions (CoreGraphics).
- Linux: X11/Randr (`libX11`/`libXrandr`); Wayland best-effort.

### `os-audio-devices`

- Enumerate output/input devices, default device, volume/mute state.
- Windows: MMDevice + WASAPI (COM vtables).
- macOS: CoreAudio HAL (`AudioObjectGetPropertyData`).
- Linux: ALSA or PipeWire/PulseAudio client libraries.

### `os-wallpaper`

- Get/set the desktop wallpaper.
- Windows: `SystemParametersInfoW` with `SPI_SETDESKWALLPAPER`.
- macOS: `NSWorkspace`/`CoreGraphics` desktop image APIs.
- Linux: desktop-environment-specific (GNOME/KDE settings backends), best-effort.

### `os-brightness`

- Read/set display brightness.
- Windows: WMI monitor brightness methods or `DXVA2` physical monitor APIs.
- macOS: `IOKit` backlight services / CoreDisplay private symbols (best-effort).
- Linux: `/sys/class/backlight` writes (requires permissions).

### `os-screenshot`

- Screen capture to PNG/JPEG buffers.
- Windows: GDI `BitBlt`/`CreateDIBSection`.
- macOS: `CGWindowListCreateImage` / ScreenCaptureKit (requires screen-recording
  permission).
- Linux: X11 capture; Wayland requires portal protocols (best-effort).

### `os-input`

- Synthetic mouse/keyboard events; possibly global input state queries.
- Windows: `SendInput`, `GetLastInputInfo` (idle time).
- macOS: `CGEventPost` (requires accessibility permission).
- Linux: XTest extension; Wayland limited/best-effort.

### `os-hotkey`

- Register application-global keyboard shortcuts.
- Windows: `RegisterHotKey`/`UnregisterHotKey`.
- macOS: Carbon `RegisterEventHotKey` or `AddGlobalMonitorForEventsMatchingMask`.
- Linux: X11 grab keys; Wayland limited/best-effort.

## Release Round 5 — Media (FFmpeg)

### `os-media`

- FFI bindings into the FFmpeg shared libraries (`libavcodec`, `libavformat`,
  `libavutil`, `libswscale`, `libswresample`) — plain C APIs, no shelling out to the
  `ffmpeg` binary.
- Pin a major FFmpeg version and probe it at load time (`avcodec_version()`); degrade
  gracefully when the libraries are absent, like `linux-libsecret` does.
- Phase 1: image conversions (format transcoding, resize/scale via `libswscale`,
  metadata extraction).
- Phase 2: video conversions (container/codec transcoding, frame extraction,
  thumbnails, audio track handling via `libswresample`).
- Note: ABI changes on each FFmpeg major version; codec availability depends on the
  installed build.

## Release Round 6 — System configuration & services

### `os-autostart`

- Manage login items/startup entries.
- Windows: `HKCU/HKLM ...\Run` registry keys (optionally Startup folder shortcuts).
- macOS: launchd agents (`LaunchAgents` plists) / `SMAppService`.
- Linux: XDG autostart `.desktop` entries.

### `win-service`

- Manage Windows services via the Service Control Manager (`OpenSCManagerW`,
  `CreateServiceW`, `StartServiceW`, `ControlService`, `EnumServicesStatusExW`).

### `launchd-helpers` (macOS)

- Install/load/unload launchd agents and daemons; query status.

### `os-timezone` / `os-locale`

- Read/set system timezone and locale preferences.
- Windows: `SetDynamicTimeZoneInformation`, registry locale values.
- macOS: `systemsetup`-equivalent private APIs / `NSTimeZone` defaults (best-effort).
- Linux: `/etc/localtime` + `timedatectl` integration.

### `os-network`

- Interface enumeration, hostname/DNS info, online detection.
- Windows: `GetAdaptersAddresses` (iphlpapi).
- macOS: `getifaddrs`, SystemConfiguration reachability.
- Linux: `getifaddrs`, netlink, NetworkManager checks (best-effort).

### `os-default-apps`

- Query/default handlers for URLs and file extensions.
- Windows: registry-based association lookups (`UserChoice` keys).
- macOS: `LSCopyDefaultApplicationURLForURL` / `LSSetDefaultRoleHandlerForContentType`.
- Linux: `xdg-mime` compatible settings files.

### `win-firewall` / `win-uac`

- Firewall rule management via `INetFwPolicy2` (COM vtables).
- Elevation prompts/manifest checks via `ShellExecuteExW` with `runas`.

## Release Round 7 — Advanced system introspection

### `os-certstore`

- Enumerate/import/export certificates from system stores.
- Windows: CryptoAPI cert store functions (`CertOpenSystemStoreW`,
  `CertEnumCertificatesInStore`).
- macOS: Keychain certificate APIs (SecCertificate/SecTrust).
- Linux: NSS/p11-kit or PEM bundle parsing.

### `os-hardware`

- Hardware inventory: CPU model/cores, memory, SMBIOS/DMI data, machine UUIDs.
- Windows: `GetSystemFirmwareTable` (SMBIOS), `GetLogicalProcessorInformationEx`,
  `GlobalMemoryStatusEx`.
- macOS: `sysctl` and IOKit platform expert (`IOPlatformUUID`).
- Linux: `/proc/cpuinfo`, `/proc/meminfo`, `/sys/class/dmi/id`.
