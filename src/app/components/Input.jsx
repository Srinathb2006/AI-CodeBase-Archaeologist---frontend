import { forwardRef } from "react";
import { clsx } from "clsx";

export const Input = forwardRef(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-xl border border-border bg-input px-4 py-2.5",
        "text-foreground placeholder:text-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring transition-all",
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";
