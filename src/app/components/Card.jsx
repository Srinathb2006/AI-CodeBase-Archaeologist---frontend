import { clsx } from "clsx";

export function Card({ glass, className, children, ...props }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-border p-6",
        glass ? "bg-card/50 backdrop-blur-xl" : "bg-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }) {
  return <div className={clsx("mb-4", className)}>{children}</div>;
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={clsx("text-card-foreground", className)}>{children}</h3>
  );
}

export function CardContent({ children, className }) {
  return <div className={className}>{children}</div>;
}
