import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

// Restyled on the TradeLinks semantic tokens (DESIGN.md): amber --c-signal
// carries interaction, --c-urgent carries problems, chip tokens carry the
// primary action. Focus comes from the global 2px --c-signal focus-visible
// ring in app/globals.css; shadcn's default palette is not used.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-meta font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-chipbg text-chipink hover:bg-chipbg/90",
        destructive: "border border-urgent/45 bg-urgent/10 text-urgent hover:bg-urgent/15",
        outline: "border border-linestrong bg-transparent text-ink hover:bg-surface",
        secondary: "border border-line bg-surface2 text-ink hover:bg-surface",
        ghost: "text-muted hover:bg-surface hover:text-ink",
        link: "text-signal underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-label",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
