/* Curated Daily Protocol & Wisdom Quote Widget */
const quotes = [
  { text: "Simplicity is the prerequisite for reliability.", author: "Edsger W. Dijkstra" },
  { text: "Focus is a muscle. Practice turning distraction into stillness.", author: "Marcus Aurelius" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Deep work is the ability to focus without distraction on a cognitively demanding task.", author: "Cal Newport" },
  { text: "The details are not the details. They make the design.", author: "Charles Eames" }
];

export const quoteWidget = {
  name: "Daily Wisdom & Quotes",
  icon: "quote",

  mount(container) {
    let quoteIndex = Math.floor(Math.random() * quotes.length);

    const render = () => {
      const q = quotes[quoteIndex];
      container.innerHTML = `
        <div class="flex flex-col justify-between w-full h-full p-2 text-center">
          <div class="text-neutral-500 text-3xl font-serif">“</div>
          <p class="font-serif italic text-lg md:text-xl text-neutral-200 leading-relaxed px-2">
            ${q.text}
          </p>
          <div class="text-xs font-mono text-neutral-400 mt-2">
            — ${q.author}
          </div>
          <button class="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors" id="next-quote-btn">
            Next Wisdom ?
          </button>
        </div>
      `;

      container.querySelector("#next-quote-btn").addEventListener("click", () => {
        quoteIndex = (quoteIndex + 1) % quotes.length;
        render();
      });
    };

    render();

    return {
      unmount() {}
    };
  }
};
