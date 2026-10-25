# Orbit Music Player

A lightweight, dark-themed, browser-based music player for listening to audio from **public MEGA folders** and managing **M3U/M3U8 playlists**.

**Website:** https://aswins404.github.io/orbit

Orbit runs in your browser and does not require you to sign in to a MEGA account. Connect a public MEGA folder, browse its audio files, and manage playback and playlists from one interface.

## Features

### 🎵 MEGA music library
- Connect to a public MEGA folder using its share URL.
- Discover supported audio files in the folder and its subfolders.
- Search tracks by filename or folder path.
- View file size separately from track length when duration metadata is available.
- Play, pause, skip, seek, adjust volume, mute, shuffle, and repeat.
- Manage the upcoming queue, play tracks next, and remove queued tracks.
- Preload the next track after playback passes the halfway point when possible.
- Download the currently selected track.
- Display available cover art, with a built-in placeholder when artwork is unavailable.

### 📃 Playlist support
- Import `.m3u` and `.m3u8` playlist files from your device.
- Find and import playlists from a public MEGA folder. Up to **two imported MEGA playlists** can be active at a time.
- Keep **All MEGA Songs** separate from imported playlists.
- Match playlist entries to tracks in MEGA, or use **Match local audio** to select local files or folders for matching.
- Review unresolved playlist entries.
- Edit imported playlists by reordering tracks or removing entries.
- Export edited playlists to your device as M3U/M3U8 files.
- Remove imported playlists from the player without deleting the underlying audio files.

### 🖥️ Interface and accessibility
- Responsive layout for desktop and mobile.
- Queue access on mobile.
- Keyboard shortcuts:
  - `Space` — play or pause
  - `J` — previous track
  - `K` — next track
  - `/` — focus the search field
- Reduced-motion support for the scrolling current-track title.

## Supported audio formats

Orbit recognizes files with these extensions:

`mp3`, `m4a`, `aac`, `ogg`, `opus`, `wav`, `flac`, `oga`, `weba`, `webm`, `mp4`, `aif`, `aiff`, `mid`, `midi`, and `3gp`.

Actual playback depends on the audio codecs supported by your browser.

## Getting started

### Run locally

Because the app loads MEGAJS as a JavaScript module, run it through a local web server instead of opening `index.html` directly using a `file://` URL.

1. Download or clone this repository.
2. Open a terminal in the project folder.
3. If Python is installed, start a local server:

   ```bash
   python -m http.server 8000
   ```

4. Open <http://localhost:8000> in your browser.

### Use Orbit

1. Open Orbit in your browser.
2. Enter a public MEGA folder share URL and connect the folder.
3. Browse **All MEGA Songs** or search by track name or folder path.
4. Select a song and use the player controls to manage playback.
5. Import an M3U/M3U8 playlist from your device, or find playlists in a public MEGA folder.
6. If a playlist references local paths, select **Match local audio** and choose the relevant files or folder.
7. Edit a playlist as needed and export it with **Save Playlist to Device**.
8. Use the download control to save the selected track to your device.

## How it works

1. Orbit loads the MEGAJS browser client.
2. It scans the public MEGA folder and its subfolders for supported audio files.
3. When you play a track, Orbit downloads and decrypts the file in your browser before playback through the HTML audio element.
4. Playback controls manage the current track and queue. When possible, Orbit begins downloading the next queued track after the current track passes 50% playback.
5. Playlist edits are held in the current page session. Export an edited playlist if you want to keep a copy.

**Note:** Playback is download-before-playback, not progressive streaming.

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript (ES modules and browser APIs)
- [MEGAJS](https://github.com/meganz/MEGA.js), loaded from unpkg
- HTML audio element

## Project structure

```text
.
├── index.html   # Page structure and player interface
├── script.js    # MEGA connection, playlists, playback, queue, and controls
├── style.css    # Theme, layout, responsive styling, and animations
└── README.md    # Project documentation
```

## Privacy and security

- **Use public MEGA share links only.** Orbit does not sign in to your MEGA account.
- A MEGA share URL may contain a decryption key after `#`. Anyone with the complete link may be able to access the shared content. Do not publish private share links or keys in source code, screenshots, issues, or public documentation.
- Audio is downloaded and decrypted in your browser for playback. The selected track and next-track preload may use substantial bandwidth and browser memory.
- The current implementation skips tracks larger than **200 MB**.
- The MEGAJS client is loaded from a CDN, so internet and CDN availability are required.
- Local audio files selected for playlist matching are not uploaded by that selection process. The browser can access only files you explicitly select.
- Playlist edits do not modify files in the original MEGA folder.
- Imported playlist state is session-based. Export playlists you want to preserve.
- Some M3U entries may remain unmatched if their paths cannot be resolved.
- GitHub Pages can host the static site; no backend server or database is included.

## Credits

- **OpenAI Codex:** Credited for assisting with the creation and development of this website, including coding and implementation support.
- **MEGAJS:** The browser client used to access public MEGA folder contents. See the [MEGAJS repository](https://github.com/meganz/MEGA.js).

## License

MIT License

Feel free to use, modify, and distribute this project.