import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center text-center"
    >
      <div className="size-16 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center mb-5 shadow-glow">
        <Icon className="size-8" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          className="mt-5 bg-gradient-primary text-primary-foreground border-0"
        >
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
