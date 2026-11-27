// Kiri, the mascot. Concept art for test builds: the illustrator's final set replaces these files
// before launch (see the licensing and mascot plan). She appears on first run, empty states, loading,
// errors and milestones, never on results, plots or exports, and is hidden in Expert mode.
import wave from "../assets/mascot/kiri-wave.webp";
import curious from "../assets/mascot/kiri-curious.webp";
import thinking from "../assets/mascot/kiri-thinking.webp";
import oops from "../assets/mascot/kiri-oops.webp";
import proud from "../assets/mascot/kiri-proud.webp";

const POSE = { wave, curious, thinking, oops, proud };
export type Pose = keyof typeof POSE;

export function Mascot({ pose, size = 96, say }: { pose: Pose; size?: number; say?: string }) {
  const img = <img className="mascot-img" src={POSE[pose]} width={size} height={size} alt="" aria-hidden draggable={false} />;
  if (!say) return <span className="mascot">{img}</span>;
  return (
    <div className="mascot mascot-say">
      {img}
      <p className="mascot-bubble">{say}</p>
    </div>
  );
}
