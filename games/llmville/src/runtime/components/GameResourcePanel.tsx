/**
 * Top-left resource display (money, tokens) — LED scoreboard aesthetic.
 */

import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { formatCompactNumber, formatMoney } from "@/economy/economy";
import { servingIncomePerHour } from "@llmville/game/economy/hourlyRates";

interface ResourceFlash {
  delta: number;
  token: number;
}

interface GameResourcePanelProps {
  money: number;
  dataTokens: number;
  servingIncomeRate: number;
  className?: string;
}

function formatDelta(amount: number, prefix: string, format: (value: number) => string) {
  const abs = format(Math.abs(amount));
  return amount < 0 ? `-${prefix}${abs}` : `+${prefix}${abs}`;
}

function formatTokenDelta(amount: number) {
  return Math.floor(amount).toLocaleString();
}

export function GameResourcePanel({
  money,
  dataTokens,
  servingIncomeRate,
  className,
}: GameResourcePanelProps) {
  const previousMoneyRef = useRef(money);
  const previousTokensRef = useRef(dataTokens);
  const [cashFlash, setCashFlash] = useState<ResourceFlash | null>(null);
  const [tokenFlash, setTokenFlash] = useState<ResourceFlash | null>(null);
  const incomePerHour = servingIncomePerHour(servingIncomeRate);
  const isEarning = incomePerHour > 0;

  useEffect(() => {
    const previousMoney = previousMoneyRef.current;
    if (money !== previousMoney) {
      const delta = money - previousMoney;
      const token = Date.now();
      setCashFlash({ delta, token });
      window.setTimeout(() => {
        setCashFlash((current) => (current?.token === token ? null : current));
      }, 1300);
    }
    previousMoneyRef.current = money;
  }, [money]);

  useEffect(() => {
    const previousTokens = previousTokensRef.current;
    if (dataTokens !== previousTokens) {
      const delta = dataTokens - previousTokens;
      const token = Date.now();
      setTokenFlash({ delta, token });
      window.setTimeout(() => {
        setTokenFlash((current) => (current?.token === token ? null : current));
      }, 1300);
    }
    previousTokensRef.current = dataTokens;
  }, [dataTokens]);

  const cashSpendBump = cashFlash != null && cashFlash.delta < 0;
  const cashGainBump = cashFlash != null && cashFlash.delta > 0;
  const tokenSpendBump = tokenFlash != null && tokenFlash.delta < 0;
  const tokenGainBump = tokenFlash != null && tokenFlash.delta > 0;

  return (
    <div
      className={cn(
        "pointer-events-none max-w-[calc(100vw-2rem)] rounded-2xl border border-brand-teal/20 bg-brand-ink/90 p-3 shadow-lg backdrop-blur-md animate-in slide-in-from-left duration-500",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-6">
        <div className="game-resource-panel__stat">
          <span className="game-resource-panel__label">Cash</span>
          <div className="game-resource-panel__cash-value-wrap">
            <span
              className={cn(
                "game-resource-panel__value game-resource-panel__value--cash",
                cashSpendBump && "game-resource-panel__value--spend-bump",
                cashGainBump && "game-resource-panel__value--gain-bump",
              )}
            >
              <span className="text-brand-amber">$</span>
              {formatMoney(money)}
            </span>
            {cashFlash && (
              <span
                key={cashFlash.token}
                className={cn(
                  "game-resource-panel__delta-flash",
                  cashFlash.delta < 0
                    ? "game-resource-panel__delta-flash--spend"
                    : "game-resource-panel__delta-flash--gain",
                )}
              >
                {formatDelta(cashFlash.delta, "$", formatMoney)}
              </span>
            )}
          </div>
        </div>
        <div className="game-resource-panel__stat">
          <span className="game-resource-panel__label">Tokens</span>
          <div className="game-resource-panel__cash-value-wrap">
            <span
              className={cn(
                "game-resource-panel__value game-resource-panel__value--tokens",
                tokenSpendBump && "game-resource-panel__value--spend-bump",
                tokenGainBump && "game-resource-panel__value--gain-bump",
              )}
            >
              {formatCompactNumber(dataTokens)}
            </span>
            {tokenFlash && (
              <span
                key={tokenFlash.token}
                className={cn(
                  "game-resource-panel__delta-flash",
                  tokenFlash.delta < 0
                    ? "game-resource-panel__delta-flash--spend"
                    : "game-resource-panel__delta-flash--gain",
                )}
              >
                {formatDelta(tokenFlash.delta, "", formatTokenDelta)}
              </span>
            )}
          </div>
        </div>
      </div>
      {isEarning && (
        <div className="game-resource-panel__income animate-in fade-in duration-500">
          <span className="text-brand-teal leading-none">▲</span>
          <span className="font-game text-sm font-bold tabular-nums text-brand-teal sm:text-base">
            +${formatMoney(incomePerHour)}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-cream/55 sm:text-xs">
            / hr
          </span>
        </div>
      )}
    </div>
  );
}
