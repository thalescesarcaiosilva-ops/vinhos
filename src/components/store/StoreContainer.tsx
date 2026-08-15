import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type StoreContainerProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "nav";
  children: ReactNode;
};

export function StoreContainer({
  as: Element = "div",
  className,
  children,
  ...props
}: StoreContainerProps) {
  return (
    <Element className={cn("mx-auto w-full max-w-[1440px] px-4 sm:px-6", className)} {...props}>
      {children}
    </Element>
  );
}
