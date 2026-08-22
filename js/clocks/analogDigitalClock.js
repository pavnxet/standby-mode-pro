/* Bauhaus Minimalist Analog + Digital Clock */
export const analogDigitalClock = {
  name: "Bauhaus Analog & Digital",
  description: "Swiss railway minimalist analog dial paired with digital companion",
  category: "Classic",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="analog-digital-container">
          <div class="analog-dial">
            <div class="analog-hand hand-hour" id="analog-hour-hand"></div>
            <div class="analog-hand hand-minute" id="analog-minute-hand"></div>
            <div class="analog-hand hand-second" id="analog-second-hand"></div>
            <div class="analog-center-dot"></div>
          </div>
          <div class="digital-companion">
            <div class="digital-companion-time" id="analog-digital-time">12:00</div>
            <div class="digital-companion-date" id="analog-digital-date">Aug 22, Sat</div>
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawHours, rawMinutes, rawSeconds }) {
        const hourDeg = (rawHours % 12 + rawMinutes / 60) * 30;
        const minDeg = (rawMinutes + rawSeconds / 60) * 6;
        const secDeg = rawSeconds * 6;

        const hHand = container.querySelector("#analog-hour-hand");
        if (hHand) hHand.style.transform = `rotate(${hourDeg}deg)`;

        const mHand = container.querySelector("#analog-minute-hand");
        if (mHand) mHand.style.transform = `rotate(${minDeg}deg)`;

        const sHand = container.querySelector("#analog-second-hand");
        if (sHand) sHand.style.transform = `rotate(${secDeg}deg)`;

        const dTime = container.querySelector("#analog-digital-time");
        if (dTime) dTime.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;

        const dDate = container.querySelector("#analog-digital-date");
        if (dDate) {
          dDate.textContent = now.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
        }
      },
      unmount() {}
    };
  }
};
