import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

// Semantic-token restyle; readiness is never carried by colour alone
// (DESIGN.md) — consumers must render the literal word inside the badge.
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-label font-semibold transition-colors duration-200",
  {
    variants: {
      variant: {
        default: "border-transparent bg-chipbg text-chipink",
        secondary: "border-line bg-surface2 text-ink",
        destructive: "border-urgent/45 bg-urgent/10 text-urgent",
        outline: "border-linestrong text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
