export function NotFoundPage({ path }: { path: string }) {
  return (
    <section className="page-panel">
      <div>
        <h1>페이지를 찾을 수 없습니다</h1>
        <p>{path}</p>
      </div>

      <div className="action-grid">
        <a href="/">홈으로 이동</a>
      </div>
    </section>
  );
}
