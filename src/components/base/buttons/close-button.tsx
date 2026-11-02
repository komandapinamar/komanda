import type { ButtonHTMLAttributes, Ref } from "react";
import { cx, sortCx } from "@/utils/cx";

type CloseButtonSize = "2xs" | "xs" | "sm" | "md";

export interface CloseButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  size?: CloseButtonSize;
  "aria-label": string;
  ref?: Ref<HTMLButtonElement>;
}

const GLYPH_SIZE: Record<CloseButtonSize, number> = {
  "2xs": 6.8,
  xs: 10.8,
  sm: 12.6,
  md: 16.2,
};

const STROKE_WIDTH: Record<CloseButtonSize, number> = {
  "2xs": 1.6,
  xs: 2,
  sm: 2,
  md: 2.5,
};

const GLYPH_INSET: Record<CloseButtonSize, number> = {
  "2xs": 0.57,
  xs: 2,
  sm: 2,
  md: 2,
};

const styles = sortCx({
  base: [
    "inline-flex shrink-0 items-center justify-center rounded-full",
    "bg-background-tertiary-default text-foreground-icon-secondary",
    "select-none cursor-pointer",
    "transition-colors duration-150 ease",
    "hover:text-text-primary",
    "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
  ].join(" "),
  container: {
    "2xs": "size-4",
    xs: "size-5",
    sm: "size-6",
    md: "size-8",
  },
});

export function CloseButton({
  size = "xs",
  className,
  type = "button",
  ref,
  ...props
}: CloseButtonProps) {
  const glyph = GLYPH_SIZE[size];
  const strokeWidth = STROKE_WIDTH[size];
  const inset = GLYPH_INSET[size];

  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.base, styles.container[size], className)}
      {...props}
    >
      <svg width={glyph} height={glyph} viewBox={`0 0 ${glyph} ${glyph}`} fill="none" aria-hidden>
        <path
          d={`M${inset} ${inset}L${glyph - inset} ${glyph - inset}`}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={`M${glyph - inset} ${inset}L${inset} ${glyph - inset}`}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
