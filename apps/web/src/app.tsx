import { fixtureBurrow, fixtureNodes } from "@deepburrow/types";
import { Canvas } from "@/components/canvas";

export function App() {
  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Canvas nodes={fixtureNodes} />
      <div
        data-testid="burrow-title"
        className="pointer-events-none absolute left-4 top-3 z-10 hidden text-sm text-muted-foreground sm:block"
      >
        {fixtureBurrow.title}
      </div>
    </div>
  );
}
