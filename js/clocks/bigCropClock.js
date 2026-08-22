/* Big Crop Pixel Style Clock */
export const bigCropClock = {
  name: "Big Crop Typographic",
  description: "Oversized bold cropped numerals with high-contrast edge impact",
  category: "Modern",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="big-crop-container">
          <div class="big-crop-time" id="big-crop-text">00:00</div>
          ${config.showSeconds ? `<div class="big-crop-seconds" id="big-crop-sec">00</div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ hours, minutes, seconds }) {
        const textEl = container.querySelector("#big-crop-text");
        if (textEl) textEl.textContent = `${hours}:${minutes}`;

        const secEl = container.querySelector("#big-crop-sec");
        if (secEl) secEl.textContent = `${seconds}s`;
      },
      unmount() {}
    };
  }
};
