import { fixtureHole, fixtureNodes } from "@deepburrow/types";

export function App() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{fixtureHole.title}</h1>
      {fixtureNodes.map((node) => (
        <article key={node.id} className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-medium">{node.title}</h2>
          <p>{node.markdown}</p>
        </article>
      ))}
    </main>
  );
}
