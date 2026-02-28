import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[10px] bg-white/[0.03]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
