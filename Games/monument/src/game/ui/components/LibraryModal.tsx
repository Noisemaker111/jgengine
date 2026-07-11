import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { CITY_LIBRARY_LIMIT, readCityLibrary, snapshotSummary } from "../../city/library";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";

type Run = (action: string, input?: unknown) => void;

const FIELD =
  "w-full border border-[rgba(20,22,18,0.22)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1.5 text-[11px] text-[#171916] outline-none focus:border-[#171916]";
const IDLE_BTN =
  "border border-[rgba(20,22,18,0.22)] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#171916] transition hover:bg-[rgba(20,22,18,0.08)]";

export function LibraryModal({ revision, run, onClose }: { revision: number; run: Run; onClose: () => void }): ReactNode {
  const saves = useMemo(() => readCityLibrary(), [revision]);
  const [draftName, setDraftName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const save = (): void => {
    run("city.save", { name: draftName.trim() });
    setDraftName("");
  };
  const commitRename = (id: string): void => {
    const next = renameValue.trim();
    if (next !== "") run("city.rename", { recordId: id, name: next });
    setRenameId(null);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[115] grid place-items-center bg-[rgba(12,15,13,0.6)] px-4 py-8 backdrop-blur-[8px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-library-title"
        className={`flex max-h-[calc(100dvh-4rem)] w-[min(560px,100%)] flex-col overflow-hidden ${PANEL}`}
      >
        <header className={`flex items-start justify-between border-b px-4 pb-3 pt-3.5 ${HAIRLINE}`}>
          <div>
            <span className={EYEBROW}>Saved on this device</span>
            <h2 id="city-library-title" className="mt-1 text-[17px] font-bold tracking-[-0.01em] text-[#171916]">
              City library
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close city library"
            className="grid h-6 w-6 place-items-center text-[13px] leading-none text-[#4b4e47] transition hover:bg-[rgba(20,22,18,0.08)]"
          >
            ✕
          </button>
        </header>

        <div className={`border-b px-4 py-3 ${HAIRLINE}`}>
          <span className={EYEBROW}>Save current city</span>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              aria-label="City name"
              maxLength={40}
              value={draftName}
              placeholder="Name this city"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
              }}
              className={FIELD}
            />
            <button type="button" onClick={save} className={`shrink-0 bg-[#171916] text-[#eeeae0] ${IDLE_BTN} hover:bg-[#2a2c26]`}>
              Save
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {saves.length === 0 ? (
            <p className="px-4 py-8 text-center text-[10px] text-[#8a8d84]">Your saved cities will appear here.</p>
          ) : (
            saves.map((record) => {
              const summary = snapshotSummary(record.snapshot);
              const renaming = renameId === record.id;
              const confirming = deleteId === record.id;
              return (
                <div key={record.id} className={`flex items-center gap-2.5 border-b px-4 py-2.5 ${HAIRLINE}`}>
                  <div className="min-w-0 flex-1">
                    {renaming ? (
                      <input
                        aria-label="Rename city"
                        autoFocus
                        maxLength={40}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitRename(record.id);
                          if (event.key === "Escape") setRenameId(null);
                        }}
                        onBlur={() => commitRename(record.id)}
                        className={FIELD}
                      />
                    ) : (
                      <>
                        <b className="block truncate text-[11px] font-semibold text-[#171916]">{record.name}</b>
                        <small className="mt-0.5 block text-[9px] text-[#73766e]">
                          Day {summary.day} · {summary.structures} structures
                        </small>
                      </>
                    )}
                  </div>
                  {renaming ? (
                    <button type="button" onClick={() => commitRename(record.id)} className={IDLE_BTN}>
                      Done
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => run("city.open", { recordId: record.id })} className={IDLE_BTN}>
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameId(record.id);
                          setRenameValue(record.name);
                          setDeleteId(null);
                        }}
                        className={IDLE_BTN}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        aria-label={confirming ? `Confirm delete ${record.name}` : `Delete ${record.name}`}
                        onClick={() => {
                          if (confirming) {
                            run("city.delete", { recordId: record.id });
                            setDeleteId(null);
                          } else {
                            setDeleteId(record.id);
                          }
                        }}
                        className={`${IDLE_BTN} ${confirming ? "border-[#ef715b] bg-[#ef715b] text-[#eeeae0] hover:bg-[#ef715b]" : "hover:border-[#ef715b] hover:text-[#c0442e]"}`}
                      >
                        {confirming ? "Confirm" : "Delete"}
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className={`border-t px-4 py-2.5 text-[8.5px] font-medium uppercase tracking-[0.06em] text-[#8a8d84] ${HAIRLINE}`}>
          Up to {CITY_LIBRARY_LIMIT} cities kept on this device
        </p>
      </section>
    </div>
  );
}
