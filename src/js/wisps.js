/* ==========================================================================
   Background wisps
   --------------------------------------------------------------------------
   Soft ribbons of colour that slowly change shape. Add data-wisps to any
   <section> to give it this background. Visitors who prefer reduced motion
   see them standing still.
   ========================================================================== */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Each wisp flows between three shapes. Numbers are points on a
     1400 x 700 canvas: start, two curve handles, middle, last handle, end. */
  const WISPS = [
    {
      colors: ["#20c9a6", "#2fc4f5"], width: 46, seconds: 28, opacity: 0.4,
      shapes: [
        [-50, 470, 250, 250, 450, 650, 760, 440, 1180, 200, 1450, 380],
        [-50, 330, 250, 450, 450, 260, 760, 540, 1180, 340, 1450, 230],
        [-50, 560, 250, 150, 450, 600, 760, 330, 1180, 250, 1450, 500],
      ],
    },
    {
      colors: ["#ff5fa8", "#7b3fe4"], width: 30, seconds: 36, opacity: 0.4,
      shapes: [
        [-50, 220, 300, 420, 520, 60, 860, 230, 1200, 520, 1450, 300],
        [-50, 330, 300, 180, 520, 320, 860, 120, 1200, 380, 1450, 430],
        [-50, 140, 300, 500, 520, -30, 860, 330, 1200, 620, 1450, 190],
      ],
    },
    {
      colors: ["#ffe94a", "#ff5fa8"], width: 22, seconds: 44, opacity: 0.25,
      shapes: [
        [-50, 600, 350, 520, 620, 700, 980, 560, 1300, 470, 1450, 600],
        [-50, 510, 350, 650, 620, 510, 980, 630, 1300, 570, 1450, 490],
        [-50, 660, 350, 450, 620, 670, 980, 490, 1300, 420, 1450, 650],
      ],
    },
  ];

  const toPath = (p) => `M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}S${p[8]} ${p[9]} ${p[10]} ${p[11]}`;

  function buildWisps(id) {
    const gradients = WISPS.map((wisp, i) => `
      <linearGradient id="wisp-${id}-${i}">
        <stop offset="0" stop-color="${wisp.colors[0]}"/>
        <stop offset="1" stop-color="${wisp.colors[1]}"/>
      </linearGradient>`).join("");

    const paths = WISPS.map((wisp, i) => {
      const [a, b, c] = wisp.shapes;
      const animation = reduceMotion ? "" : `
        <animate attributeName="d" dur="${wisp.seconds}s" begin="-${id * 11}s" repeatCount="indefinite"
          calcMode="spline" keyTimes="0;.33;.66;1" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"
          values="${[a, b, c, a].map(toPath).join(";")}"/>`;
      return `<path d="${toPath(a)}" stroke="url(#wisp-${id}-${i})" stroke-width="${wisp.width}" opacity="${wisp.opacity}">${animation}</path>`;
    }).join("");

    return `
      <svg class="wisps" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          ${gradients}
          <filter id="wisp-blur-${id}" x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="16"/>
          </filter>
        </defs>
        <g filter="url(#wisp-blur-${id})">${paths}</g>
      </svg>`;
  }

  document.querySelectorAll("[data-wisps]").forEach((section, id) => {
    section.insertAdjacentHTML("afterbegin", buildWisps(id));
  });
})();
