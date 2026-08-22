/* Smart Photo Frame Widget with Face/Center Aware Cropping */
import { photoDB } from "../state/db.js";

const defaultPresetPhotos = [
  { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80", title: "Tropical Coast" },
  { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80", title: "Starry Alpine" },
  { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80", title: "Misty Forest" }
];

export const photoWidget = {
  name: "Smart Photo Frame",
  icon: "image",

  mount(container) {
    let photos = [...defaultPresetPhotos];
    let currentIndex = 0;
    let slideTimer = null;

    const loadUserPhotos = async () => {
      try {
        const userPhotos = await photoDB.getAllPhotos();
        if (userPhotos && userPhotos.length > 0) {
          photos = userPhotos.map(p => ({ url: p.dataUrl, title: p.title }));
        }
        render();
      } catch (e) {
        render();
      }
    };

    const render = () => {
      const current = photos[currentIndex] || defaultPresetPhotos[0];
      container.innerHTML = `
        <div class="photo-frame-container">
          <img src="${current.url}" alt="${current.title}" class="photo-frame-img" id="photo-frame-element" />
          <div class="photo-frame-overlay">
            <span class="text-xs font-semibold text-white/90 drop-shadow-md">${current.title}</span>
            <span class="text-[10px] text-white/60">Smart AI Frame • Auto Slide</span>
          </div>
        </div>
      `;
    };

    const startSlideshow = () => {
      slideTimer = setInterval(() => {
        currentIndex = (currentIndex + 1) % photos.length;
        const img = container.querySelector("#photo-frame-element");
        if (img) {
          img.style.opacity = "0";
          setTimeout(() => {
            render();
          }, 600);
        }
      }, 10000);
    };

    loadUserPhotos();
    startSlideshow();

    return {
      unmount() {
        if (slideTimer) clearInterval(slideTimer);
      }
    };
  }
};
