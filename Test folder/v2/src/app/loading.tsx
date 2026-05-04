export default function Loading() {
  return <LoadingScreen />;
}

export function LoadingScreen() {
  return (
    <main className="loadingShell">
      <section className="loadingCard" aria-live="polite">
        <img src="/chill-logo.png" alt="Chill Coffee Garden" className="loadingLogo" />
        <div>
          <p className="eyebrow">Chill Coffee Garden</p>
          <h1>Đang tải dữ liệu vận hành...</h1>
          <p className="muted">App đang kiểm tra phiên đăng nhập và đồng bộ dữ liệu Supabase.</p>
        </div>
        <div className="loadingCards">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
