// Subtle repeating paw-print SVG pattern as background
const PAW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
  <g fill="white" opacity="0.02">
    <circle cx="30" cy="28" r="6"/>
    <circle cx="20" cy="18" r="4"/>
    <circle cx="40" cy="18" r="4"/>
    <circle cx="16" cy="28" r="3.5"/>
    <circle cx="44" cy="28" r="3.5"/>
  </g>
</svg>`;

const encoded = `url("data:image/svg+xml,${encodeURIComponent(PAW_SVG)}")`;

export default function PawPrintBg() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        backgroundImage: encoded,
        backgroundSize: "120px 120px",
        backgroundRepeat: "repeat",
      }}
    />
  );
}
