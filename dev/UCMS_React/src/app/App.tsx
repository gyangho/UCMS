import {
  BoardDetailPage,
  FaqBoardPage,
  InquiryBoardPage,
  NoticeBoardPage
} from "../features/board/BoardPages";
import { AdminPage } from "../features/admin/AdminPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { DriveGenerateFormPage } from "../features/drive/DriveGenerateFormPage";
import { EventCalendarPage, EventDetailPage, EventFormPage, MyEventsPage } from "../features/event/EventPages";
import {
  FinanceDetailPage,
  FinanceFormPage,
  FinancePage,
} from "../features/finance/FinancePage";
import { LegacyRoutePage } from "../features/legacy/LegacyRoutePage";
import { NotFoundPage } from "../features/legacy/NotFoundPage";
import { MemberPage } from "../features/member/MemberPage";
import { MypagePage, PasswordChangePage } from "../features/mypage/MypagePage";
import { PosInstanceDetailPage } from "../features/pos/PosInstanceDetailPage";
import { PosInstancesPage } from "../features/pos/PosInstancesPage";
import { PosRecordsPage } from "../features/pos/PosRecordsPage";
import { PublicRecruitResponsePage } from "../features/publicRecruit/PublicRecruitResponsePage";
import { PublicRecruitResultPage } from "../features/publicRecruit/PublicRecruitResultPage";
import { RecruitSharedDocPage } from "../features/recruit/RecruitSharedDocPage";
import {
  ActiveInterviewSchedulesPage,
  InterviewPlanCreatePage,
  InterviewPlanDetailPage,
  InterviewPlansPage
} from "../features/recruit/InterviewPlansPage";
import { RecruitFormsPage, RecruitInstanceDetailPage } from "../features/recruit/RecruitFormsPage";
import { AppShell } from "../shared/layout/AppShell";
import { PublicShell } from "../shared/layout/PublicShell";
import { useCurrentRoute } from "./router";

export function App() {
  const route = useCurrentRoute();

  if (route.kind === "public") {
    return (
      <PublicShell>
        {/* 2026-08-22: Anonymous users enter the UCMS email/password and email-2FA flow. */}
        {route.id === "forgot-password" ? (
          <ForgotPasswordPage />
        ) : route.id === "login" || route.id === "register" ? (
          <LoginPage initialMode={route.id === "register" ? "register" : "login"} />
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
      return <AdminPage path={route.path} />;
    case "mypage":
      return <MypagePage />;
    case "mypage-password":
      return <PasswordChangePage />;
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
    case "recruit-detail":
      return <RecruitInstanceDetailPage path={route.path} />;
    case "recruit-shared-doc":
      return <RecruitSharedDocPage path={route.path} />;
    case "interview-plans":
      return <InterviewPlansPage />;
    // 2026-07-23: Render the schema-backed interview workflow and confirmed schedule table.
    case "interview-active-schedules":
      return <ActiveInterviewSchedulesPage />;
    case "interview-plan-create":
      return <InterviewPlanCreatePage path={route.path} />;
    case "interview-plan-edit":
      return <InterviewPlanCreatePage path={route.path} />;
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
    // 2026-07-23: Render settlement creation and editing as dedicated routes.
    case "finance-create":
      return <FinanceFormPage mode="create" />;
    case "finance-detail":
      return <FinanceDetailPage path={route.path} />;
    case "finance-edit":
      return <FinanceFormPage mode="edit" path={route.path} />;
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
