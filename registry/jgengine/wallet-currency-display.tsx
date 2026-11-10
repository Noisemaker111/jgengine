/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { useCurrency } from "@jgengine/react/hooks";

import { CurrencyDisplay } from "@/components/ui/currency-display";

export function WalletCurrencyDisplay({
  currencyId,
  symbol,
  name,
  compact,
  className,
}: {
  currencyId: string;
  symbol?: ReactNode;
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  const amount = useCurrency(currencyId);
  return <CurrencyDisplay amount={amount} symbol={symbol} name={name} compact={compact} className={className} />;
}
