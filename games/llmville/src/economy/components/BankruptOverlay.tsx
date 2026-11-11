/** @jsxImportSource @jgengine/core/ui/jsx */
import { api } from "@llmville/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useState } from "@jgengine/core/ui/jsx";

import { useAuth } from "../../auth";
import { BankruptScreen } from "./BankruptScreen";

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

  return <BankruptScreen isDismissing={isDismissing} onDismiss={() => void dismiss()} />;
}
