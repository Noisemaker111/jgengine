import { ChevronLeft, Play } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { StandalonePageShell } from "@/branding/components/StandalonePageShell";
import { CharacterCustomizeViewport } from "@/user/components/CharacterCustomizeViewport";
import type { CanonicalAvatarId } from "@llmville/game/user/founder";
import { normalizeAvatarId } from "@llmville/game/user/founder";
import {
  CHARACTER_FISH_COLORS,
  CHARACTER_HOODIE_COLORS,
  CHARACTER_PANTS_COLORS,
  CHARACTER_SHOES_COLORS,
  DEFAULT_CHARACTER_LOOK,
  type CharacterFishColorId,
  type CharacterHoodieColorId,
  type CharacterLook,
  type CharacterPantsColorId,
  type CharacterShoesColorId,
} from "@/user/playerCharacterFigure";
import {
  getMentorPerkSummary,
  useCreateWorldCustomizeScreen,
  type AvatarDefinition,
  type AvatarId,
} from "@/user/user";

const MENTOR_DEFAULT_HOODIE: Record<CanonicalAvatarId, CharacterHoodieColorId> = {
  sam_altman: "charcoal",
  lee_rob: "sage",
  elon_xai: "teal",
  dario_amodei: "charcoal",
  logan_kilpatrick: "coral",
};

function defaultCharacterLookForMentor(avatarId: CanonicalAvatarId): CharacterLook {
  return {
    ...DEFAULT_CHARACTER_LOOK,
    hoodie: MENTOR_DEFAULT_HOODIE[normalizeAvatarId(avatarId)],
  };
}

function MentorPortrait({ avatar, className }: { avatar: AvatarDefinition; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center bg-[#0f1715]", className)}>
        <span className="text-lg font-bold text-brand-teal">{avatar.name.charAt(0)}</span>
      </div>
    );
  }

  return (
    <img
      src={avatar.portraitSrc}
      alt=""
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}

function MentorPickCard({
  avatar,
  isSelected,
  onSelect,
  className,
  dataMentorId,
}: {
  avatar: AvatarDefinition;
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
  dataMentorId?: boolean;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <button
      type="button"
      data-mentor-id={dataMentorId ? avatar.id : undefined}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex flex-col rounded-xl border bg-[#121a18]/90 p-2 text-left transition-all",
        isSelected
          ? "border-brand-teal/60 shadow-[0_0_0_1px_rgba(95,194,168,0.25)]"
          : "border-white/8 hover:border-brand-teal/25",
        className,
      )}
    >
      <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-[#0a100e]">
        <MentorPortrait avatar={avatar} className="h-full w-full" />
      </div>
      <p className={cn("mt-2 text-sm font-semibold leading-tight", isSelected ? "text-brand-teal" : "text-brand-cream")}>
        {avatar.name}
      </p>
      <p className="mt-0.5 text-xs font-medium text-brand-teal/85">{avatar.perkTitle}</p>
      <p className="mt-1 text-[11px] leading-snug text-brand-cream/55">{getMentorPerkSummary(avatar.id)}</p>
    </button>
  );
}

function useMentorCarouselSnap(
  containerRef: RefObject<HTMLDivElement | null>,
  selectedAvatarId: AvatarId,
  onSelect: (id: AvatarId) => void,
) {
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const syncSelectionFromScroll = () => {
      const cards = container.querySelectorAll<HTMLElement>("[data-mentor-id]");
      if (cards.length === 0) return;

      const center = container.scrollLeft + container.clientWidth / 2;
      let closestId: AvatarId | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const card of cards) {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(center - cardCenter);
        const id = card.dataset.mentorId as AvatarId | undefined;
        if (!id || distance >= closestDistance) continue;
        closestDistance = distance;
        closestId = id;
      }

      if (closestId && closestId !== selectedAvatarId) {
        onSelectRef.current(closestId);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncSelectionFromScroll);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", onScroll);
    };
  }, [containerRef, selectedAvatarId]);
}

function ColorSwatchRow<T extends string>({
  label,
  options,
  value,
  onChange,
  renderColor,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  renderColor: (option: T) => string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-brand-cream/55">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              aria-label={option}
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={cn(
                "h-9 w-9 rounded-full border-2 transition-transform",
                selected ? "scale-110 border-brand-cream" : "border-white/15 hover:border-brand-teal/40",
              )}
              style={{ backgroundColor: renderColor(option) }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function CreateWorldCustomizeScreen() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const {
    avatars,
    selectedAvatarId,
    selectAvatar,
    handleContinue,
    isLoading,
    isStarting,
    error,
    canContinue,
  } = useCreateWorldCustomizeScreen();

  const [characterLook, setCharacterLook] = useState<CharacterLook>(() =>
    defaultCharacterLookForMentor(selectedAvatarId),
  );

  useEffect(() => {
    setCharacterLook((prev) => ({
      ...prev,
      hoodie: defaultCharacterLookForMentor(selectedAvatarId).hoodie,
    }));
  }, [selectedAvatarId]);

  const scrollCardIntoView = useCallback((avatarId: AvatarId) => {
    const container = carouselRef.current;
    if (!container) return;
    const card = container.querySelector<HTMLElement>(`[data-mentor-id="${avatarId}"]`);
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  const handleSelectAvatar = useCallback(
    (avatarId: AvatarId) => {
      selectAvatar(avatarId);
      scrollCardIntoView(avatarId);
    },
    [scrollCardIntoView, selectAvatar],
  );

  useMentorCarouselSnap(carouselRef, selectedAvatarId, selectAvatar);

  return (
    <StandalonePageShell>
      <div className="mx-auto w-full max-w-2xl animate-in fade-in duration-300">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-base font-semibold text-brand-teal transition-colors hover:text-brand-cream"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
          Back
        </Link>

        <header className="mb-8">
          <h1 className="font-game text-2xl font-extrabold tracking-tight text-brand-cream sm:text-3xl">
            Create your lab
          </h1>
          <p className="mt-2 text-sm text-brand-cream/60">Pick a mentor and set your look.</p>
        </header>

        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-cream/45">Choose your mentor</h2>

          <div className="md:hidden -mx-4 px-4">
            <div
              ref={carouselRef}
              className="flex gap-3 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
            >
              {avatars.map((avatar) => (
                <MentorPickCard
                  key={avatar.id}
                  avatar={avatar}
                  isSelected={avatar.id === selectedAvatarId}
                  onSelect={() => handleSelectAvatar(avatar.id)}
                  dataMentorId
                  className="w-[min(68vw,200px)] shrink-0 snap-center"
                />
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-brand-cream/40">Swipe to browse mentors</p>
          </div>

          <div className="hidden gap-2 md:grid md:grid-cols-5">
            {avatars.map((avatar) => (
              <MentorPickCard
                key={avatar.id}
                avatar={avatar}
                isSelected={avatar.id === selectedAvatarId}
                onSelect={() => selectAvatar(avatar.id)}
              />
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-cream/45">Customize character</h2>
          <CharacterCustomizeViewport
            look={characterLook}
            className="mb-4 h-72 w-full overflow-hidden rounded-xl border border-white/10 bg-[#121a18] sm:h-80"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorSwatchRow<CharacterFishColorId>
              label="Fish"
              options={Object.keys(CHARACTER_FISH_COLORS) as CharacterFishColorId[]}
              value={characterLook.fish}
              onChange={(fish) => setCharacterLook((prev) => ({ ...prev, fish }))}
              renderColor={(fish) => CHARACTER_FISH_COLORS[fish].color}
            />
            <ColorSwatchRow<CharacterHoodieColorId>
              label="Hoodie"
              options={Object.keys(CHARACTER_HOODIE_COLORS) as CharacterHoodieColorId[]}
              value={characterLook.hoodie}
              onChange={(hoodie) => setCharacterLook((prev) => ({ ...prev, hoodie }))}
              renderColor={(hoodie) => CHARACTER_HOODIE_COLORS[hoodie].color}
            />
            <ColorSwatchRow<CharacterPantsColorId>
              label="Pants"
              options={Object.keys(CHARACTER_PANTS_COLORS) as CharacterPantsColorId[]}
              value={characterLook.pants}
              onChange={(pants) => setCharacterLook((prev) => ({ ...prev, pants }))}
              renderColor={(pants) => CHARACTER_PANTS_COLORS[pants].color}
            />
            <ColorSwatchRow<CharacterShoesColorId>
              label="Shoes"
              options={Object.keys(CHARACTER_SHOES_COLORS) as CharacterShoesColorId[]}
              value={characterLook.shoes}
              onChange={(shoes) => setCharacterLook((prev) => ({ ...prev, shoes }))}
              renderColor={(shoes) => CHARACTER_SHOES_COLORS[shoes].color}
            />
          </div>
        </section>

        {error ? <p className="mb-3 text-center text-sm text-[#f0a097]">{error}</p> : null}

        <Button
          type="button"
          variant="primary"
          disabled={isLoading || !canContinue}
          onClick={() => void handleContinue()}
          className="w-full py-3.5 text-base disabled:opacity-50"
        >
          <Play className="h-5 w-5" />
          <span>{isStarting ? "Starting your lab…" : "Start playing"}</span>
        </Button>
      </div>
    </StandalonePageShell>
  );
}
