/* 7-Segment LED Digital Alarm Clock */
export const segmentedClock = {
  name: "7-Segment Retro LED",
  description: "Classic bedside alarm clock digital phosphor display",
  category: "Digital",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="segmented-clock-container">
          <div class="seg-digit-group" id="seg-hours">00</div>
          <div class="seg-digit-group animate-pulse">:</div>
          <div class="seg-digit-group" id="seg-minutes">00</div>
          ${config.showSeconds ? `
            <div class="seg-digit-group text-3xl md:text-5xl self-end mb-2 text-red-500/80" id="seg-seconds">00</div>
          ` : ""}
        </div>
        ${!config.is24Hour ? `<div id="seg-ampm" class="mt-3 font-mono font-bold text-red-400/80 tracking-widest">AM</div>` : ""}
      </div>
    `;

    return {
      update({ hours, minutes, seconds, ampm }) {
        const hEl = container.querySelector("#seg-hours");
        if (hEl) hEl.textContent = hours;

        const mEl = container.querySelector("#seg-minutes");
        if (mEl) mEl.textContent = minutes;

        const sEl = container.querySelector("#seg-seconds");
        if (sEl) sEl.textContent = seconds;

        const ampmEl = container.querySelector("#seg-ampm");
        if (ampmEl) ampmEl.textContent = ampm;
      },
      unmount() {}
    };
  }
};
