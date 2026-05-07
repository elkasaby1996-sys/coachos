import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { selectVariants } from "../../lib/dropdown-system";
import { cn } from "../../lib/utils";

export interface SelectProps
  extends
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {
  contentClassName?: string;
  isInvalid?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      children,
      className,
      defaultValue,
      disabled,
      id,
      name,
      onChange,
      value,
      variant,
      size,
      contentClassName,
      isInvalid,
      ...props
    },
    ref,
  ) => {
    const options = React.Children.toArray(children).flatMap((child) => {
      if (!React.isValidElement(child) || child.type !== "option") return [];

      const optionValue = child.props.value ?? "";
      const optionLabel = child.props.children ?? optionValue;

      return [
        {
          value: String(optionValue),
          label: optionLabel as React.ReactNode,
          disabled: Boolean(child.props.disabled),
        },
      ];
    });

    const resolvedDefaultValue =
      defaultValue == null ? (options[0]?.value ?? "") : String(defaultValue);
    const [internalValue, setInternalValue] =
      React.useState<string>(resolvedDefaultValue);
    const isControlled = value != null;
    const stringValue = isControlled ? String(value) : internalValue;
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
      if (!isControlled) {
        setInternalValue(resolvedDefaultValue);
      }
    }, [isControlled, resolvedDefaultValue]);

    if (options.length === 0) {
      return (
        <select
          ref={ref}
          id={id}
          name={name}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          className={cn(selectVariants({ variant, size }), className)}
          {...props}
        >
          {children}
        </select>
      );
    }

    const selectedOption =
      options.find((option) => option.value === stringValue) ?? options[0];
    const handleValueChange = (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue);
      }

      onChange?.({
        target: { value: nextValue, name: name ?? "" },
        currentTarget: { value: nextValue, name: name ?? "" },
      } as React.ChangeEvent<HTMLSelectElement>);
      setOpen(false);
    };

    return (
      <>
        <select
          ref={ref}
          name={name}
          disabled={disabled}
          value={stringValue}
          onChange={onChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          {...props}
        >
          {children}
        </select>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button
              type="button"
              id={id}
              disabled={disabled}
              data-state={open ? "open" : "closed"}
              className={cn(
                selectVariants({ variant, size }),
                "app-select-trigger relative inline-flex items-center justify-between gap-3 text-left",
                className,
              )}
              data-invalid={isInvalid ? "true" : undefined}
              aria-invalid={isInvalid || props["aria-invalid"] ? true : undefined}
              aria-label={props["aria-label"]}
              aria-labelledby={props["aria-labelledby"]}
              aria-describedby={props["aria-describedby"]}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              <span className="min-w-0 truncate">
                {selectedOption?.label ?? "Select option"}
              </span>
              <ChevronDown className="app-select-trigger-icon h-4 w-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            size={size === "sm" ? "compact" : "default"}
            className={cn(
              "w-[var(--radix-dropdown-menu-trigger-width)] min-w-[12rem]",
              contentClassName,
            )}
          >
            {options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                size={size === "sm" ? "compact" : "default"}
                disabled={option.disabled}
                onClick={() => handleValueChange(option.value)}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.value === stringValue ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  },
);

Select.displayName = "Select";

export { Select };
