const CONFIG = {
  rainColumns: 200,
  rainFade: 0.2,
  rainFrameRate: 1000 / 18,
  rainResilience: 0.8,
  suggestionLimit: 4,
};

class Rain extends HTMLElement {
  #backgroundColor;
  #canvas;
  #ctx;
  #drops;
  #lastRender;
  #rainColor;
  #size;

  constructor() {
      super();
      this.attachShadow({
          mode: 'open'
      });
      const template = document.getElementById('rain-template');
      const clone = template.content.cloneNode(true);
      this.#canvas = clone.querySelector('.rain');
      this.#ctx = this.#canvas.getContext('2d', {
          alpha: false
      });
      this.#renderCanvas();
      const rerender = Rain.debounce(this.#renderCanvas, CONFIG.rainFrameRate);
      const mq = '(prefers-color-scheme: light)';
      window.matchMedia(mq).addEventListener('change', rerender);
      window.addEventListener('resize', rerender);
      this.shadowRoot.append(clone);
  }

  static cssVar(name) {
      return getComputedStyle(document.body).getPropertyValue(name);
  }

  static debounce(fn, delay) {
      let timeout;

      return () => {
          clearTimeout(timeout);
          timeout = setTimeout(() => fn.apply(this, arguments), delay);
      };
  }

  #renderCanvas = () => {
      this.#canvas.height = window.innerHeight;
      this.#canvas.width = window.innerWidth;
      this.#size = Math.ceil(this.#canvas.width / CONFIG.rainColumns);
      this.#backgroundColor = Rain.cssVar('--color-background');
      this.#rainColor = Rain.cssVar('--color-rain');
      this.#ctx.fillStyle = this.#backgroundColor;
      this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
      this.#drops = new Array(CONFIG.rainColumns).fill(0);
      this.#lastRender = performance.now();
      requestAnimationFrame(this.#renderRain);
  };

  #renderRain = (timestamp) => {
      if (timestamp - this.#lastRender >= CONFIG.rainFrameRate) {
          this.#ctx.fillStyle = this.#backgroundColor;
          this.#ctx.globalAlpha = CONFIG.rainFade;
          this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);

          for (let i = 0; i < this.#drops.length; i++) {
              this.#ctx.fillStyle = this.#rainColor;
              this.#ctx.globalAlpha = 1;
              const y = this.#drops[i] * this.#size;
              this.#ctx.fillRect(i * this.#size, y, this.#size, this.#size);
              const reset = Math.random() > CONFIG.rainResilience;
              if (reset || y > this.#canvas.height) this.#drops[i] = 0;
              else this.#drops[i]++;
          }

          this.#lastRender = timestamp;
      }

      requestAnimationFrame(this.#renderRain);
  };
}

customElements.define('rain-component', Rain);