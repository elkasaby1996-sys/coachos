import { cva } from "class-variance-authority";

export const dropdownMenuContentVariants = cva(
  "app-dropdown-content z-50 min-w-[13rem] overflow-hidden border text-popover-foreground backdrop-blur-3xl",
  {
    variants: {
      variant: {
        menu: "rounded-[24px] p-2",
        panel: "rounded-[26px] p-0",
      },
      size: {
        default: "",
        compact: "rounded-[22px] p-1.5",
      },
    },
    defaultVariants: {
      variant: "menu",
      size: "default",
    },
  },
);

export const dropdownMenuItemVariants = cva(
  "app-dropdown-item relative flex min-w-0 cursor-pointer select-none items-center gap-3 outline-none transition-[background-color,color,border-color,transform] duration-200 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  {
    variants: {
      size: {
        default: "min-h-[2.75rem] rounded-[18px] px-3 py-2.5 text-sm font-medium",
        compact: "min-h-[2.5rem] rounded-[16px] px-3 py-2 text-[13px] font-medium",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export const dropdownMenuLabelVariants = cva(
  "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--menu-label-color)]",
  {
    variants: {
      size: {
        default: "",
        compact: "px-2.5 py-1 text-[9px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export const dropdownMenuSeparatorVariants = cva(
  "-mx-1 my-2 h-px bg-[var(--menu-separator-color)]",
  {
    variants: {
      size: {
        default: "",
        compact: "my-1.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export const selectVariants = cva("app-select", {
  variants: {
    variant: {
      field: "app-select-field",
      filter: "app-select-filter",
    },
    size: {
      default: "h-11 text-sm",
      sm: "app-select-sm text-[13px]",
    },
  },
  defaultVariants: {
    variant: "field",
    size: "default",
  },
});
