/* Universal Media Player Widget with Real-Time Lyrics */
import { store } from "../state/store.js";
import { soundEngine } from "../engines/soundEngine.js";

const demoTracks = [
  {
    title: "Midnight Lo-Fi Chill",
    artist: "Aura Ambient",
    coverGradient: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    lyrics: [
      "Soft raindrops hitting the glass...",
      "Late night thoughts drifting away...",
      "Focus mode engaged, time slows down...",
      "Calm melodies flowing through the night..."
    ]
  },
  {
    title: "Cosmic Horizon",
    artist: "Solaris Dream",
    coverGradient: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    lyrics: [
      "Floating above the atmosphere...",
      "Stars illuminating the distant dark...",
      "Endless horizons ahead...",
      "Peace within the silence..."
    ]
  }
];

export const mediaWidget = {
  name: "Universal Media Player",
  icon: "music",

  mount(container) {
    let trackIndex = store.getState().mediaState.currentTrackIndex || 0;
    let isPlaying = store.getState().mediaState.isPlaying || false;
    let lyricLine = 0;
    let lyricInterval = null;

    const render = () => {
      const track = demoTracks[trackIndex];
      container.innerHTML = `
        <div class="media-container">
          <div class="media-track-info">
            <div class="media-artwork" style="background: ${track.coverGradient}">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div class="media-text">
              <h4>${track.title}</h4>
              <p>${track.artist}</p>
            </div>
          </div>

          <div class="media-lyrics-box">
            <div class="lyrics-active-line" id="lyrics-active">${track.lyrics[lyricLine]}</div>
            <div class="lyrics-next-line" id="lyrics-next">${track.lyrics[(lyricLine + 1) % track.lyrics.length]}</div>
          </div>

          <div class="media-controls">
            <button class="btn-icon" id="media-prev" aria-label="Previous Track">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
            </button>

            <button class="btn-icon bg-blue-600 hover:bg-blue-500 text-white w-12 h-12" id="media-play" aria-label="Play/Pause">
              ${isPlaying ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              `}
            </button>

            <button class="btn-icon" id="media-next" aria-label="Next Track">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>
          </div>
        </div>
      `;

      // Event handlers
      container.querySelector("#media-play").addEventListener("click", () => {
        isPlaying = !isPlaying;
        store.getState().mediaState.isPlaying = isPlaying;
        if (isPlaying) {
          soundEngine.playAmbient("binaural");
          startLyrics();
        } else {
          soundEngine.stopAmbient();
          stopLyrics();
        }
        render();
      });

      container.querySelector("#media-next").addEventListener("click", () => {
        trackIndex = (trackIndex + 1) % demoTracks.length;
        lyricLine = 0;
        store.getState().mediaState.currentTrackIndex = trackIndex;
        render();
      });

      container.querySelector("#media-prev").addEventListener("click", () => {
        trackIndex = (trackIndex - 1 + demoTracks.length) % demoTracks.length;
        lyricLine = 0;
        store.getState().mediaState.currentTrackIndex = trackIndex;
        render();
      });
    };

    const startLyrics = () => {
      stopLyrics();
      lyricInterval = setInterval(() => {
        const track = demoTracks[trackIndex];
        lyricLine = (lyricLine + 1) % track.lyrics.length;
        const actEl = container.querySelector("#lyrics-active");
        const nextEl = container.querySelector("#lyrics-next");
        if (actEl) actEl.textContent = track.lyrics[lyricLine];
        if (nextEl) nextEl.textContent = track.lyrics[(lyricLine + 1) % track.lyrics.length];
      }, 4000);
    };

    const stopLyrics = () => {
      if (lyricInterval) {
        clearInterval(lyricInterval);
        lyricInterval = null;
      }
    };

    render();

    return {
      unmount() {
        stopLyrics();
      }
    };
  }
};
