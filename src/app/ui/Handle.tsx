/** A player handle: the name in the text colour, the `#tag` lighter, so names read first. */
export function Handle({ name, tag }: { name: string; tag: string }) {
  return (
    <span className="handle">
      <span className="handle__name">{name}</span>
      <span className="handle__tag">#{tag}</span>
    </span>
  );
}
