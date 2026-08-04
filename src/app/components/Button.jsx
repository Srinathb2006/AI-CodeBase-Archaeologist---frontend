import { forwardRef } from "react";
import { clsx } from "clsx";

export const Button = forwardRef(
  (
    { variant = "primary", size = "md", className, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          {
            "bg-primary text-primary-foreground hover:opacity-90":
              variant === "primary",
            "bg-secondary text-secondary-foreground hover:opacity-90":
              variant === "secondary",
            "border border-border bg-transparent hover:bg-muted":
              variant === "outline",
            "bg-transparent hover:bg-muted": variant === "ghost",
            "px-3 py-1.5": size === "sm",
            "px-4 py-2": size === "md",
            "px-6 py-3": size === "lg",
          },
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
