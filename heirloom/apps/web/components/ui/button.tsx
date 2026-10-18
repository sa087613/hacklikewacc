import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-tap items-center justify-center gap-2 whitespace-nowrap rounded-btn font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-red-600 text-white hover:bg-red-700",
        secondary: "border border-line bg-card text-navy-900 hover:bg-pill-mute",
        quiet: "text-navy-900 hover:bg-pill-mute",
        "on-dark": "border border-white/25 bg-white/10 text-white hover:bg-white/20",
        ghost: "text-navy-900 hover:bg-pill-mute", // alias of quiet
      },
      size: { default: "px-5 text-[15px]", sm: "px-4 text-sm", icon: "min-w-tap px-0" },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
