import { type AppRoute } from "../../app/router";

type LegacyRoute = Exclude<AppRoute, { kind: "not-found" }>;

interface LegacyRoutePageProps {
  route: LegacyRoute;
}

export function LegacyRoutePage({ route }: LegacyRoutePageProps) {
  return (
    <section className="page-panel">
      <div>
        <h1>{route.title}</h1>
        <p>
          이 기능은 React 데모 라우트에 연결되어 있습니다. 상세 화면과 JSON API
          연동은 기능별 명세에 맞춰 순차적으로 채울 예정입니다.
        </p>
      </div>
    </section>
  );
}
