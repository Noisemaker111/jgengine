import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/cn";
import { Progress } from "@/components/ui/progress";

const toastVariants = cva("game-toast", {
  variants: {
    variant: {
      dispatch: "game-toast--dispatch",
      social: "game-toast--social",
      "terminal-alert": "game-toast--terminal-alert",
      achievement: "game-toast--achievement",
    },
  },
  defaultVariants: {
    variant: "dispatch",
  },
});

export type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>;

interface ToastProps extends VariantProps<typeof toastVariants> {
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  progress?: number;
  avatar?: ReactNode;
  className?: string;
}

export function Toast({
  variant = "dispatch",
  title,
  children,
  onDismiss,
  progress,
  avatar,
  className,
}: ToastProps) {
  return (
    <div className={cn(toastVariants({ variant }), className)}>
      {progress !== undefined ? (
        <Progress variant="invoice-due" value={progress * 100} className="game-toast__progress" />
      ) : null}
      <div className="game-toast__inner">
        {avatar ? <div className="game-toast__avatar">{avatar}</div> : null}
        <div className="game-toast__content">
          {title || onDismiss ? (
            <div className="game-toast__header">
              {title ? <span className="game-toast__title">{title}</span> : <span />}
              {onDismiss ? (
                <button type="button" onClick={onDismiss} className="game-toast__dismiss" aria-label="Dismiss">
                  ✕
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="game-toast__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
