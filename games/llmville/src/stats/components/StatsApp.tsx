/**
 * Stats app — read-only site health and income readouts. Split out of the old ratio-based Dashboard;
 * GPU dedication now lives in the Inference app (drag cards onto Training/Scraping/Serving).
 */
import { InsetSection } from "@/components/ui/inset-section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Token } from "@/components/ui/token";
import { servingIncomePerHour, servingThroughputPerHour } from "@llmville/game/economy/hourlyRates";
import type { SiteHealth } from "@/runtime/worldViewModel";
import { isOverCapacity } from "@llmville/game/infrastructure/infrastructure";

interface StatsAppProps {
  servingIncomeRate: number;
  servingThroughputTps: number;
  siteHealth: SiteHealth;
  totalGpus: number;
  trainingGpus: number;
  scrapingGpus: number;
  servingGpus: number;
  onOpenCoolingStore?: () => void;
}

export function StatsApp({
  servingIncomeRate,
  servingThroughputTps,
  siteHealth,
  totalGpus,
  trainingGpus,
  scrapingGpus,
  servingGpus,
  onOpenCoolingStore,
}: StatsAppProps) {
  const servingPerHour = servingIncomePerHour(servingIncomeRate);
  const tokensPerHour = servingThroughputPerHour(servingThroughputTps);
  const undedicatedGpus = Math.max(0, totalGpus - trainingGpus - scrapingGpus - servingGpus);

  return (
    <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col gap-6 pb-24 duration-300">
      <StatGrid className="justify-center gap-8">
        <Stat
          variant="scoreboard"
          label="Tokens/hour"
          value={tokensPerHour >= 1000 ? `${(tokensPerHour / 1000).toFixed(1)}k` : tokensPerHour}
          tone="teal"
        />
        <Stat
          variant="scoreboard"
          label="$/hour serving"
          value={`$${servingPerHour >= 1000 ? `${(servingPerHour / 1000).toFixed(1)}k` : servingPerHour.toFixed(0)}`}
          tone="amber"
        />
      </StatGrid>

      <InsetSection
        label="Site power"
        trailing={
          siteHealth.thermalThrottle * siteHealth.powerThrottle < 0.99 ? (
            <Token tone="coral">
              Throttled −{Math.round((1 - siteHealth.thermalThrottle * siteHealth.powerThrottle) * 100)}%
            </Token>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
          <div>
            <p className="game-section-label">Grid draw</p>
            <p className={`text-sm font-bold tabular-nums ${isOverCapacity(siteHealth.powerDrawKw, siteHealth.powerCapacityKw) ? "text-[#f0a097]" : "text-brand-cream"}`}>
              {siteHealth.powerDrawKw.toFixed(1)}/{siteHealth.powerCapacityKw.toFixed(1)} kW
            </p>
          </div>
          <div>
            <p className="game-section-label">Rack cooling</p>
            <p className={`text-sm font-bold tabular-nums ${isOverCapacity(siteHealth.heatLoadKw, siteHealth.coolingCapacityKw) ? "text-[#f0a097]" : "text-brand-cream"}`}>
              {siteHealth.heatLoadKw.toFixed(1)}/{siteHealth.coolingCapacityKw.toFixed(1)} kW
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="game-section-label">VRAM</p>
            <p className={`text-sm font-bold tabular-nums ${isOverCapacity(siteHealth.vramUsedGb, siteHealth.vramCapacityGb) ? "text-[#f0a097]" : "text-brand-cream"}`}>
              {Math.round(siteHealth.vramUsedGb)}/{Math.round(siteHealth.vramCapacityGb)} GB
            </p>
          </div>
        </div>
        {onOpenCoolingStore != null && siteHealth.thermalThrottle < 0.99 && (
          <button
            type="button"
            onClick={onOpenCoolingStore}
            className="game-control-segment game-control-segment-active mt-3 w-full text-xs font-bold"
          >
            Buy rack coolers →
          </button>
        )}
      </InsetSection>

      <InsetSection label="GPU dedication" trailing={<span className="text-[10px] font-semibold text-brand-cream/45">{totalGpus} installed</span>}>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div>
            <p className="game-section-label">Training</p>
            <p className="text-sm font-bold tabular-nums text-brand-cream">{trainingGpus}</p>
          </div>
          <div>
            <p className="game-section-label">Scraping</p>
            <p className="text-sm font-bold tabular-nums text-brand-cream">{scrapingGpus}</p>
          </div>
          <div>
            <p className="game-section-label">Serving</p>
            <p className="text-sm font-bold tabular-nums text-brand-cream">{servingGpus}</p>
          </div>
          <div>
            <p className="game-section-label">Undedicated</p>
            <p className="text-sm font-bold tabular-nums text-brand-cream/60">{undedicatedGpus}</p>
          </div>
        </div>
        <p className="text-[10px] leading-snug text-brand-cream/45">Drag GPU cards in the Inference app to change dedication.</p>
      </InsetSection>
    </div>
  );
}
