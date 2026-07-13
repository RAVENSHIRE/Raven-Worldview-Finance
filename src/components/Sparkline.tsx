interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

export default function Sparkline({ data, width = 180, height = 36, stroke = '#00ff66' }: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / range) * (height - 6)).toFixed(1)}`);

  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${stroke})` }}
      />
    </svg>
  );
}
