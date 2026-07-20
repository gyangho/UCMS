import {
  BoardDetailPage,
  FaqBoardPage,
  InquiryBoardPage,
  NoticeBoardPage
} from "../features/board/BoardPages";
import { AdminPage } from "../features/admin/AdminPage";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { DriveGenerateFormPage } from "../features/drive/DriveGenerateFormPage";
import { EventCalendarPage, EventDetailPage, EventFormPage, MyEventsPage } from "../features/event/EventPages";
import { FinanceDetailPage, FinancePage } from "../features/finance/FinancePage";
import { LegacyRoutePage } from "../features/legacy/LegacyRoutePage";
import { NotFoundPage } from "../features/legacy/NotFoundPage";
import { MemberPage } from "../features/member/MemberPage";
import { MypagePage } from "../features/mypage/MypagePage";
import { PosInstanceDetailPage } from "../features/pos/PosInstanceDetailPage";
import { PosInstancesPage } from "../features/pos/PosInstancesPage";
import { PosRecordsPage } from "../features/pos/PosRecordsPage";
import { PublicRecruitResponsePage } from "../features/publicRecruit/PublicRecruitResponsePage";
import { PublicRecruitResultPage } from "../features/publicRecruit/PublicRecruitResultPage";
import { RecruitSharedDocPage } from "../features/recruit/RecruitSharedDocPage";
import {
  InterviewPlanDetailPage,
  InterviewPlansPage
} from "../features/recruit/InterviewPlansPage";
import { RecruitFormsPage } from "../features/recruit/RecruitFormsPage";
import { AppShell } from "../shared/layout/AppShell";
import { PublicShell } from "../shared/layout/PublicShell";
import { useCurrentRoute } from "./router";

export function App() {
  const route = useCurrentRoute();

  if (route.kind === "public") {
    return (
      <PublicShell>
        {/* 2026-07-16: Anonymous users enter the legacy Kakao OAuth flow from a React login page. */}
        {route.id === "login" ? (
          <LoginPage />
        ) : route.id === "public-recruit-result" ? (
          <PublicRecruitResultPage />
        ) : route.id === "public-recruit-response" ? (
          <PublicRecruitResponsePage />
        ) : (
          <LegacyRoutePage route={route} />
        )}
      </PublicShell>
    );
  }

  if (route.kind === "not-found") {
    return (
      <PublicShell>
        <NotFoundPage path={route.path} />
      </PublicShell>
    );
  }

  return <AppShell>{renderPrivateRoute(route.id, route)}</AppShell>;
}

function renderPrivateRoute(
  routeId: Exclude<ReturnType<typeof useCurrentRoute>, { kind: "public" | "not-found" }>["id"],
  route: Exclude<ReturnType<typeof useCurrentRoute>, { kind: "public" | "not-found" }>
) {
  switch (routeId) {
    case "dashboard":
      return <DashboardPage />;
    case "admin":
      return <AdminPage />;
    case "mypage":
      return <MypagePage />;
    case "board-notices":
      return <NoticeBoardPage />;
    case "board-notice-detail":
      return <BoardDetailPage board="notices" path={route.path} />;
    case "board-inquiries":
      return <InquiryBoardPage />;
    case "board-inquiry-detail":
      return <BoardDetailPage board="inquiries" path={route.path} />;
    case "board-faqs":
      return <FaqBoardPage />;
    case "board-faq-detail":
      return <BoardDetailPage board="faq" path={route.path} />;
    case "member":
      return <MemberPage />;
    case "recruit-forms":
      return <RecruitFormsPage />;
    case "recruit-shared-doc":
      return <RecruitSharedDocPage path={route.path} />;
    case "interview-plans":
      return <InterviewPlansPage />;
    case "interview-plan-detail":
      return <InterviewPlanDetailPage path={route.path} />;
    case "event-calendar":
      return <EventCalendarPage />;
    case "event-my-events":
      return <MyEventsPage />;
    case "event-create":
      return <EventFormPage mode="create" />;
    case "event-detail":
      return <EventDetailPage path={route.path} />;
    case "event-edit":
      return <EventFormPage mode="edit" path={route.path} />;
    case "drive-generate-form":
      return <DriveGenerateFormPage />;
    case "finance":
      return <FinancePage />;
    case "finance-detail":
      return <FinanceDetailPage path={route.path} />;
    case "pos-instances":
      return <PosInstancesPage />;
    case "pos-instance-detail":
    case "pos-sale":
      return <PosInstanceDetailPage path={route.path} mode={routeId === "pos-sale" ? "sale" : "detail"} />;
    case "pos-records":
      return <PosRecordsPage path={route.path} />;
    default:
      return <LegacyRoutePage route={route} />;
  }
}
