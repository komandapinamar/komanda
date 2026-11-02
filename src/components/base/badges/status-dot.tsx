import type { HTMLAttributes, Ref } from "react";
import { cx, sortCx } from "@/utils/cx";

type StatusDotColor = "green" | "yellow" | "indigo" | "rose";

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  color?: StatusDotColor;
  ref?: Ref<HTMLSpanElement>;
}

const styles = sortCx({
  base: "inline-flex size-3 shrink-0 items-center justify-center rounded-full",
  halo: {
    green: "bg-status-dot-green-halo",
    yellow: "bg-status-dot-yellow-halo",
    indigo: "bg-status-dot-indigo-halo",
    rose: "bg-rose-500/20",
  },
  dot: {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    indigo: "bg-indigo-500",
    rose: "bg-rose-500",
  },
});

export function StatusDot({ color = "green", className, ref, ...props }: StatusDotProps) {
  return (
    <span
      ref={ref}
      aria-hidden
      className={cx(styles.base, styles.halo[color], className)}
      {...props}
    >
      <span className={cx("size-1.5 rounded-full", styles.dot[color])} />
    </span>
  );
}
