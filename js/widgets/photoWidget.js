/* Smart Photo Frame Widget with safe user-photo rendering */
import { photoDB } from "../state/db.js";

const defaultPresetPhotos = [
  { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80", title: "Tropical Coast" },
  { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80", title: "Starry Alpine" },
  { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80", title: "Misty Forest" }
];

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const safePhotoUrl = (url) => {
  const value = String(url ?? "");
  if (value.startsWith("data:image/") || value.startsWith("https://")) return value;
  return "";
};

export const photoWidget = {
  name: "Smart Photo Frame",
  icon: "image",

  mount(container) {
    let photos = [...defaultPresetPhotos];
    let currentIndex = 0;
    let slideTimer = null;
    let fadeTimeout = null;
    let cancelled = false;

    const loadUserPhotos = async () => {
      try {
        const userPhotos = await photoDB.getAllPhotos();
        if (!cancelled && userPhotos?.length) {
          photos = userPhotos
            .map(p => ({ url: safePhotoUrl(p.dataUrl), title: p.title || "Custom Photo" }))
            .filter(p => p.url);
          currentIndex = 0;
        }
        if (!cancelled) render();
      } catch (e) {
        if (!cancelled) render();
      }
    };

    const render = () => {
      if (cancelled) return;
      const current = photos[currentIndex] || defaultPresetPhotos[0];
      const url = safePhotoUrl(current.url);
      container.innerHTML = `
        <div class="photo-frame-container">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(current.title)}" class="photo-frame-img" id="photo-frame-element" />
          <div class="photo-frame-overlay">
            <span class="text-xs font-semibold text-white/90 drop-shadow-md">${escapeHtml(current.title)}</span>
            <span class="text-[10px] text-white/60">Smart Photo Frame • Auto Slide</span>
          </div>
        </div>
      `;
    };

    const startSlideshow = () => {
      slideTimer = setInterval(() => {
        if (cancelled || photos.length < 2) return;
        currentIndex = (currentIndex + 1) % photos.length;
        const img = container.querySelector("#photo-frame-element");
        if (img) {
          img.style.opacity = "0";
          if (fadeTimeout) clearTimeout(fadeTimeout);
          fadeTimeout = setTimeout(() => render(), 600);
        }
      }, 10000);
    };

    loadUserPhotos();
    render();
    startSlideshow();

    return {
      unmount() {
        cancelled = true;
        if (slideTimer) clearInterval(slideTimer);
        if (fadeTimeout) clearTimeout(fadeTimeout);
      }
    };
  }
};
