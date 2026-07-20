interface PageStateProps {
  message?: string;
}

// 2026-07-16: API-only React flow needs readable loading/error states now that demo fallback is removed.
export function LoadingState({ message = "불러오는 중입니다." }: PageStateProps) {
  return <div className="page-state">{message}</div>;
}

export function ErrorState({ message = "데이터를 불러오지 못했습니다." }: PageStateProps) {
  return <div className="page-state error">{message}</div>;
}
