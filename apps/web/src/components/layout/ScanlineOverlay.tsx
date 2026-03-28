export default function ScanlineOverlay() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{
        background: `repeating-linear-gradient(
          0deg,
          transparent 0px,
          transparent 14px,
          rgba(255,255,255,0.03) 14px,
          rgba(255,255,255,0.03) 23px
        )`,
        backgroundSize: "100% 23px",
        animation: "scanline-scroll 5s linear infinite",
      }}
    />
  );
}
