import { api } from "@llmville/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";

import { useAuth } from "@/auth";
import { BankruptScreen } from "@/economy/components/BankruptScreen";

export function BankruptOverlay() {
  const { convexUser } = useAuth();
  const clearBankruptcy = useMutation(api.user.clearBankruptcy);
  const [isDismissing, setIsDismissing] = useState(false);

  const dismiss = useCallback(async () => {
    setIsDismissing(true);
    try {
      await clearBankruptcy({});
    } finally {
      setIsDismissing(false);
    }
  }, [clearBankruptcy]);

  if (convexUser?.bankruptAt === undefined) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[200] flex items-center justify-center bg-black/80 p-6">
      <BankruptScreen isDismissing={isDismissing} onDismiss={() => void dismiss()} />
    </div>
  );
}
