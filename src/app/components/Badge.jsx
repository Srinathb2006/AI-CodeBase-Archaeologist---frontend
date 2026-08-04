import { clsx } from "clsx";

export function Badge({ variant = "default", className, children, ...props }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        {
          "bg-muted text-muted-foreground": variant === "default",
          "bg-green-500/10 text-green-500": variant === "success",
          "bg-yellow-500/10 text-yellow-500": variant === "warning",
          "bg-red-500/10 text-red-500": variant === "error",
          "bg-blue-500/10 text-blue-500": variant === "info",
        },
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
