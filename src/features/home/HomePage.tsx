import { runningPipelines, useJobStore } from "../import/jobStore";
import { isCapturePipeline, stageLabel } from "../import/model/stages";
import { ReviewNudge } from "../review/ReviewNudge";
import { useOpen } from "../workspace/useOpen";
import { AliveList } from "./AliveList";
import { SearchBox } from "./SearchBox";
import { TodayShelf } from "./TodayShelf";
import s from "./Home.module.css";

const today = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });

/** Imports only: captured Gemini chats process quietly in the status bar. */
function ImportBanner() {
  const pipelines = useJobStore((st) => st.pipelines);
  const finished = useJobStore((st) => st.finished);
  const running = runningPipelines(pipelines, finished).find((p) => p.kind !== "review" && !isCapturePipeline(p));
  const { open } = useOpen();
  if (!running) return null;
  return (
    <p className={s.banner} role="status">
      <span className={s.pulse} aria-hidden /> {stageLabel(running.stage)}: {running.done.toLocaleString()} of{" "}
      {running.total.toLocaleString()}. New topics will appear here as they land. <button type="button" className={s.linkish} onClick={(e) => open({ kind: "import" }, e)}>
        Details
      </button>
    </p>
  );
}

export function HomePage() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <p className={s.eyebrow}>{today.format(new Date())}</p>
        <h1 className={s.title}>What's alive in your thinking</h1>
      </header>
      <SearchBox />
      <ImportBanner />
      <ReviewNudge />
      <TodayShelf />
      <AliveList />
    </div>
  );
}
