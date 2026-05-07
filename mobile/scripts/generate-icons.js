const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

// Icon SVG: orange background, white pump, white coin with dark $
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FF6B00"/>
  <!-- Pump body -->
  <rect x="18" y="28" width="38" height="48" rx="5" fill="white" opacity="0.95"/>
  <rect x="22" y="22" width="30" height="12" rx="4" fill="white" opacity="0.95"/>
  <!-- Screen -->
  <rect x="22" y="34" width="30" height="18" rx="2" fill="#fff7ed"/>
  <rect x="25" y="38" width="14" height="2" rx="1" fill="#c2410c"/>
  <rect x="25" y="42" width="10" height="2" rx="1" fill="#c2410c" opacity="0.6"/>
  <rect x="25" y="46" width="12" height="2" rx="1" fill="#c2410c" opacity="0.4"/>
  <!-- Pump base -->
  <rect x="18" y="71" width="38" height="5" rx="2.5" fill="white" opacity="0.6"/>
  <!-- Hose -->
  <path d="M56 34 Q68 34 68 46 Q68 60 62 62" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="58" y="59" width="8" height="5" rx="2" fill="rgba(255,255,255,0.7)"/>
  <!-- Coin -->
  <circle cx="65" cy="72" r="20" fill="white" stroke="#FF6B00" stroke-width="2"/>
  <circle cx="65" cy="72" r="16" fill="#1e3a5f"/>
  <text x="65" y="79" text-anchor="middle" fill="white" font-size="14" font-weight="900" font-family="system-ui,Arial,sans-serif">$</text>
</svg>`;

// Splash icon: same design, slightly larger safe zone
const splashSvg = iconSvg;

// Adaptive icon: transparent background, content scaled to safe zone (~66% of canvas)
const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FF6B00"/>
  <!-- Pump body -->
  <rect x="18" y="28" width="38" height="48" rx="5" fill="white" opacity="0.95"/>
  <rect x="22" y="22" width="30" height="12" rx="4" fill="white" opacity="0.95"/>
  <!-- Screen -->
  <rect x="22" y="34" width="30" height="18" rx="2" fill="#fff7ed"/>
  <rect x="25" y="38" width="14" height="2" rx="1" fill="#c2410c"/>
  <rect x="25" y="42" width="10" height="2" rx="1" fill="#c2410c" opacity="0.6"/>
  <rect x="25" y="46" width="12" height="2" rx="1" fill="#c2410c" opacity="0.4"/>
  <rect x="18" y="71" width="38" height="5" rx="2.5" fill="white" opacity="0.6"/>
  <path d="M56 34 Q68 34 68 46 Q68 60 62 62" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="58" y="59" width="8" height="5" rx="2" fill="rgba(255,255,255,0.7)"/>
  <circle cx="65" cy="72" r="20" fill="white" stroke="#FF6B00" stroke-width="2"/>
  <circle cx="65" cy="72" r="16" fill="#1e3a5f"/>
  <text x="65" y="79" text-anchor="middle" fill="white" font-size="14" font-weight="900" font-family="system-ui,Arial,sans-serif">$</text>
</svg>`;

function renderSvg(svgString, size, outputPath) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: size },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`✓ ${path.basename(outputPath)} (${size}x${size})`);
}

renderSvg(iconSvg,    1024, path.join(ASSETS, 'icon.png'));
renderSvg(adaptiveSvg, 1024, path.join(ASSETS, 'adaptive-icon.png'));
renderSvg(splashSvg,   200,  path.join(ASSETS, 'splash-icon.png'));
renderSvg(iconSvg,     48,   path.join(ASSETS, 'favicon.png'));

console.log('\nAll icons generated successfully!');
