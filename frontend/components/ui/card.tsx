"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { HTMLAttributes, ReactNode } from "react";

type CardProps = {
  hover?: boolean;
  delay?: number;
  className?: string;
  children?: ReactNode;
};

export function Card({
  className,
  hover = false,
  delay = 0,
  children,
}: CardProps) {
  const baseClass = cn(
    "tech-card rounded-xl p-5",
    hover && "cursor-pointer",
    className,
  );

  if (hover) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -2, transition: { duration: 0.15 } }}
        className={baseClass}
      >
        {children}
      </motion.div>
    );
  }

  return <div className={baseClass}>{children}</div>;
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-sm font-semibold tracking-tight text-[var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-0.5 font-mono text-xs text-[var(--muted)]", className)}
      {...props}
    />
  );
}
