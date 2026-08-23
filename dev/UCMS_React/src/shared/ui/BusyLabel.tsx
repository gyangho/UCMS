export function BusyLabel({ text = "처리 중..." }: { text?: string }) {
  // 2026-08-23: Give users immediate, accessible feedback during uploads and mutations.
  return (
    <span className="button-busy" role="status">
      <span aria-hidden="true" className="button-spinner" />
      {text}
    </span>
  );
}
