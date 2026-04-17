import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "outline";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        {
          "bg-primary/15 text-primary-light": variant === "default",
          "bg-pass/15 text-pass": variant === "success",
          "bg-serious/15 text-serious": variant === "warning",
          "bg-critical/15 text-critical": variant === "error",
          "border border-border-md text-sub": variant === "outline",
        },
        className,
      )}
      {...props}
    />
  );
}
