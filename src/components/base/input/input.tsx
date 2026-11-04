"use client";

import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  FieldError as AriaFieldError,
  Group as AriaGroup,
  Input as AriaInput,
  TextField as AriaTextField,
  useLocale,
} from "react-aria-components";
import type {
  FieldErrorProps as AriaFieldErrorProps,
  InputProps as AriaInputProps,
  TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { Label } from "./label";
import { HintText, hintTextClassName } from "./hint-text";
import { cx, sortCx } from "@/utils/cx";

export type InputSize = "medium" | "small";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface TextFieldContextValue {
  size?: InputSize;
  fieldClassName?: string;
  inputClassName?: string;
}

export const TextFieldContext = createContext<TextFieldContextValue>({});

export interface TextFieldProps
  extends Omit<AriaTextFieldProps, "className">,
    TextFieldContextValue {
  className?: string;
  children?: ReactNode | ((state: { isRequired: boolean; isInvalid: boolean; isDisabled: boolean; isReadOnly: boolean }) => ReactNode);
}

export function TextField({
  size = "medium",
  fieldClassName,
  inputClassName,
  className,
  children,
  ...props
}: TextFieldProps) {
  return (
    <TextFieldContext.Provider value={{ size, fieldClassName, inputClassName }}>
      <AriaTextField
        {...props}
        data-input-size={size}
        className={cx(
          "group flex h-max w-full flex-col items-start gap-1",
          className,
        )}
      >
        {children as never}
      </AriaTextField>
    </TextFieldContext.Provider>
  );
}

TextField.displayName = "TextField";

export interface InputBaseProps extends Omit<AriaInputProps, "size" | "className"> {
  size?: InputSize;
  className?: string;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  leadingAddon?: ReactNode;
  trailingAddon?: ReactNode;
  fieldClassName?: string;
  ref?: Ref<HTMLInputElement>;
  groupRef?: Ref<HTMLDivElement>;
}

const inputStyles = sortCx({
  field: [
    "relative flex w-full items-center",
    "rounded-2lg",
    "bg-background-tertiary-default text-foreground-icon-tertiary",
    "ring-2 ring-inset ring-transparent",
    "transition-[background-color,box-shadow,color] duration-[var(--input-transition-ms)] ease",
  ].join(" "),

  fieldSize: {
    medium: "p-2",
    small: "h-8 px-1.5 py-2",
  },

  fieldWithAddonSize: {
    medium: "h-9 ps-1 pe-2 py-2",
    small: "h-8 ps-1 pe-1.5 py-2",
  },

  content: "flex w-full items-center gap-2 min-w-0",
  leftSection: "flex flex-1 items-center gap-0.5 min-w-0",

  input: [
    "min-w-0 flex-1 !bg-transparent !border-0 !shadow-none outline-none p-0 m-0",
    "font-sans text-body-regular text-text-primary",
    "placeholder:text-text-tertiary",
    "focus:placeholder:text-text-primary",
    "disabled:text-input-disabled-text disabled:placeholder:text-input-disabled-text",
    "disabled:cursor-not-allowed",
    "aria-invalid:placeholder:text-text-error-placeholder",
  ].join(" "),

  icon: "size-5 shrink-0",
});

export interface InputFieldState {
  isFocusWithin: boolean;
  isHovered: boolean;
  isDisabled: boolean;
  isInvalid: boolean;
}

export function inputFieldClassName(
  { isFocusWithin, isHovered, isDisabled, isInvalid }: InputFieldState,
  size: InputSize = "medium",
  hasAddon = false,
) {
  return cx(
    inputStyles.field,
    hasAddon ? inputStyles.fieldWithAddonSize[size] : inputStyles.fieldSize[size],
    isHovered && !isFocusWithin && !isDisabled && !isInvalid && "ring-border-button-hover",
    isFocusWithin && !isDisabled && !isInvalid && "ring-border-button-active",
    isDisabled && "bg-input-disabled-background text-input-disabled-foreground",
    isInvalid && "bg-background-tertiary-error text-foreground-icon-error",
  );
}

export function InputBase({
  size: sizeProp,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  leadingAddon,
  trailingAddon,
  fieldClassName,
  className,
  ref,
  groupRef,
  ...inputProps
}: InputBaseProps) {
  const { direction } = useLocale();
  const ctx = useContext(TextFieldContext);
  const size: InputSize = sizeProp ?? ctx.size ?? "medium";
  const hasAddon = leadingAddon !== undefined && leadingAddon !== null;

  return (
    <AriaGroup
      ref={groupRef}
      className={(state) => cx(inputFieldClassName(state, size, hasAddon), ctx.fieldClassName, fieldClassName)}
    >
      <div className={inputStyles.content}>
        <div className={inputStyles.leftSection}>
          {hasAddon ? (
            leadingAddon
          ) : Leading ? (
            <Leading className={inputStyles.icon} aria-hidden />
          ) : null}
          <AriaInput
            ref={ref}
            {...inputProps}
            className={cx(inputStyles.input, direction === "rtl" ? "pr-1 text-right" : "pl-1 text-left", ctx.inputClassName, className)}
          />
        </div>
        {trailingAddon ?? (Trailing ? (
          <Trailing className={inputStyles.icon} aria-hidden />
        ) : null)}
      </div>
    </AriaGroup>
  );
}

InputBase.displayName = "InputBase";

export interface InputProps
  extends Omit<TextFieldProps, "children">,
    Pick<
      InputBaseProps,
      | "leadingIcon"
      | "trailingIcon"
      | "leadingAddon"
      | "fieldClassName"
      | "groupRef"
      | "ref"
    > {
  label?: ReactNode;
  hint?: ReactNode;
  errorMessage?: AriaFieldErrorProps["children"];
  tooltip?: boolean | string;
  placeholder?: string;
  inputDir?: "ltr" | "rtl" | "auto";
}

export function Input({
  label,
  hint,
  errorMessage,
  tooltip,
  placeholder,
  inputDir,
  leadingIcon,
  trailingIcon,
  leadingAddon,
  fieldClassName,
  ref,
  groupRef,
  className,
  ...textFieldProps
}: InputProps) {
  return (
    <TextField
      {...textFieldProps}
      className={className}
      aria-label={
        textFieldProps["aria-label"] ??
        (!label && typeof placeholder === "string" ? placeholder : undefined)
      }
    >
      {({ isRequired, isInvalid }) => (
        <>
          {label && (
            <Label
              isRequired={isRequired}
              isInvalid={isInvalid}
              tooltip={tooltip}
            >
              {label}
            </Label>
          )}
          <InputBase
            dir={inputDir ?? (["email", "url", "tel"].includes(textFieldProps.type ?? "") ? "ltr" : undefined)}
            ref={ref}
            groupRef={groupRef}
            placeholder={placeholder}
            leadingIcon={leadingIcon}
            trailingIcon={trailingIcon}
            leadingAddon={leadingAddon}
            fieldClassName={fieldClassName}
          />
          {isInvalid && errorMessage != null ? (
            <AriaFieldError className={hintTextClassName(true)}>{errorMessage}</AriaFieldError>
          ) : (
            hint && <HintText isInvalid={isInvalid}>{hint}</HintText>
          )}
        </>
      )}
    </TextField>
  );
}

Input.displayName = "Input";
