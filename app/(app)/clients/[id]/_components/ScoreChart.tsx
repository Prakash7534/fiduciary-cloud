"use client";

interface Bar { label: string; score: number; max: number; }

export default function ScoreChart({ bars }: { bars: Bar[] }) {
  const H = 180;
  const barW = 28;
  const gap = 10;
  const groupW = barW * 2 + gap;
  const groupGap = 44;
  const padL = 36, padR = 16, padT = 12, padB = 56;
  const W = padL + bars.length * groupW + (bars.length - 1) * groupGap + padR;
  const totalH = padT + H + padB;
  const maxVal = Math.max(...bars.map(b => b.max));
  const sy = (v: number) => padT + H - (v / maxVal) * H;
  const bh = (v: number) => (v / maxVal) * H;

  // Y-axis gridlines
  const ticks = [0, 25, 50, 75, 100].filter(t => t <= maxVal);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${totalH}`} className="overflow-visible">
      {/* gridlines */}
      {ticks.map(t => {
        const y = sy(t);
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E7EFEF" strokeWidth="1" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#6B7E86">{t}</text>
          </g>
        );
      })}
      {/* x-axis */}
      <line x1={padL} y1={padT + H} x2={W - padR} y2={padT + H} stroke="#CBD9DC" strokeWidth="1" />

      {bars.map((bar, i) => {
        const x = padL + i * (groupW + groupGap);
        return (
          <g key={bar.label}>
            {/* Score bar — teal */}
            <rect x={x} y={sy(bar.score)} width={barW} height={bh(bar.score)} fill="#175A69" rx="2" />
            <text x={x + barW / 2} y={sy(bar.score) - 3} textAnchor="middle" fontSize="9" fill="#175A69" fontWeight="600">{bar.score}</text>
            {/* Max bar — terracotta */}
            <rect x={x + barW + gap} y={sy(bar.max)} width={barW} height={bh(bar.max)} fill="#B4463C" rx="2" />
            <text x={x + barW + gap + barW / 2} y={sy(bar.max) - 3} textAnchor="middle" fontSize="9" fill="#B4463C" fontWeight="600">{bar.max}</text>
            {/* group label */}
            <text x={x + barW + gap / 2} y={padT + H + 16} textAnchor="middle" fontSize="11" fill="#0F3A46" fontWeight="500">{bar.label}</text>
          </g>
        );
      })}

      {/* legend */}
      <rect x={padL} y={padT + H + 32} width={10} height={10} fill="#175A69" rx="1" />
      <text x={padL + 14} y={padT + H + 41} fontSize="10" fill="#0F3A46">Score</text>
      <rect x={padL + 58} y={padT + H + 32} width={10} height={10} fill="#B4463C" rx="1" />
      <text x={padL + 72} y={padT + H + 41} fontSize="10" fill="#0F3A46">Max</text>
    </svg>
  );
}
