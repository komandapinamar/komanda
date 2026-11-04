"use client";

import type { ReactNode, Ref } from "react";
import type { TextProps as AriaTextProps } from "react-aria-components";
import { Text as AriaText } from "react-aria-components";
import { cx } from "@/utils/cx";

export interface HintTextProps extends AriaTextProps {
  children: ReactNode;
  isInvalid?: boolean;
  ref?: Ref<HTMLElement>;
}

export function hintTextClassName(isInvalid: boolean, className?: string) {
  return cx(
    "pt-px text-caption-1-medium text-text-secondary",
    isInvalid && "text-text-error-primary",
    className,
  );
}

export function HintText({
  isInvalid = false,
  className,
  ...props
}: HintTextProps) {
  return (
    <AriaText
      slot={isInvalid ? "errorMessage" : "description"}
      {...props}
      className={hintTextClassName(isInvalid, className)}
    />
  );
}
