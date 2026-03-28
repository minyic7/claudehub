import { useEffect, useRef } from "react";

// Simple pixel art cat scene drawn on canvas
export default function CatScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    let frame = 0;
    let animId: number;

    function draw() {
      ctx!.clearRect(0, 0, w, h);

      // Stars
      ctx!.fillStyle = "#c8c8d420";
      const starPositions = [
        [30, 15], [80, 25], [140, 10], [200, 30], [260, 18],
        [50, 45], [120, 55], [180, 40], [240, 50], [300, 35],
      ];
      for (const [sx, sy] of starPositions) {
        const twinkle = Math.sin(frame * 0.03 + sx) * 0.3 + 0.7;
        ctx!.globalAlpha = twinkle * 0.4;
        ctx!.fillRect(sx % w, sy % h, 2, 2);
      }
      ctx!.globalAlpha = 1;

      // Moon
      ctx!.fillStyle = "#fbbf2430";
      ctx!.beginPath();
      ctx!.arc(w - 40, 25, 12, 0, Math.PI * 2);
      ctx!.fill();

      // Cat silhouette (pixel-style)
      const catX = w / 2 - 20;
      const catY = h - 30 + Math.sin(frame * 0.02) * 2; // gentle float
      ctx!.fillStyle = "#a855f730";

      // Body
      ctx!.fillRect(catX, catY, 40, 16);
      // Head
      ctx!.fillRect(catX + 10, catY - 12, 20, 14);
      // Ears
      ctx!.fillRect(catX + 10, catY - 18, 6, 8);
      ctx!.fillRect(catX + 24, catY - 18, 6, 8);
      // Eyes
      const eyeBlink = Math.sin(frame * 0.05) > 0.95;
      if (!eyeBlink) {
        ctx!.fillStyle = "#a855f770";
        ctx!.fillRect(catX + 14, catY - 6, 4, 3);
        ctx!.fillRect(catX + 22, catY - 6, 4, 3);
      }
      // Tail
      ctx!.fillStyle = "#a855f725";
      ctx!.fillRect(catX + 38, catY - 4, 4, 4);
      ctx!.fillRect(catX + 42, catY - 8, 4, 4);
      ctx!.fillRect(catX + 46, catY - 10, 4, 3);

      // Zzz (sleeping)
      const zAlpha = Math.sin(frame * 0.04) * 0.3 + 0.5;
      ctx!.fillStyle = `rgba(168, 85, 247, ${zAlpha * 0.3})`;
      ctx!.font = "8px 'Press Start 2P'";
      ctx!.fillText("z", catX + 32, catY - 20 - Math.sin(frame * 0.03) * 3);
      ctx!.font = "6px 'Press Start 2P'";
      ctx!.fillText("z", catX + 38, catY - 28 - Math.sin(frame * 0.025) * 4);

      frame++;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
