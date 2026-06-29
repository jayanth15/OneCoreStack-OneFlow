import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/theme";
import { TONE_CLASSES } from "@/lib/theme";

type StatTone = Tone | "destructive" | "success" | "neutral";

const EXTRA_TONES: Record<
  "destructive" | "success" | "neutral",
  { tile: string; text: string }
> = {
  destructive: {
    tile: "bg-destructive/10 text-destructive",
    text: "text-destructive",
  },
  success: { tile: "bg-success/10 text-success", text: "text-success" },
  neutral: { tile: "bg-primary/10 text-primary", text: "text-primary" },
};

function resolveTone(tone: StatTone) {
  if (tone in TONE_CLASSES) return TONE_CLASSES[tone as Tone];
  return EXTRA_TONES[tone as "destructive" | "success" | "neutral"];
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: StatTone;
}

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
}: StatCardProps) {
  const toneClasses = resolveTone(tone);
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-lg mb-3",
          toneClasses.tile
        )}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
}
